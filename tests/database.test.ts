import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

// Real PostgreSQL engine. Only the Supabase platform schemas are minimal fixtures.
// This does not emulate GoTrue, PostgREST, Storage HTTP APIs, or live gateway behavior.
test("migrations, payment rollback/retry, inventory, permissions and check-in", async (t) => {
  const db = new PGlite({ extensions: { pgcrypto } });
  try {
    await db.exec(`
      CREATE EXTENSION pgcrypto;
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}', email_confirmed_at timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
      CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array($1,'/') $$;
      GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
    `);
    const directory = new URL("../supabase/migrations/", import.meta.url);
    for (const name of (await readdir(directory)).filter((n) => n.endsWith(".sql")).sort()) {
      try {
        await db.exec(await readFile(new URL(name, directory), "utf8"));
      } catch (error) {
        throw new Error(`Migration ${name}: ${String(error)}`);
      }
    }
    const user = "00000000-0000-4000-8000-000000000001";
    const event = "00000000-0000-4000-8000-000000000002";
    const batch = "00000000-0000-4000-8000-000000000003";
    await db.exec(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('${user}','test@example.com',now());
      INSERT INTO public.user_roles(user_id,role) VALUES ('${user}','admin') ON CONFLICT DO NOTHING;
      INSERT INTO public.events(id,slug,title,starts_at,status,created_by) VALUES ('${event}','test','Test',now()+interval '1 day','published','${user}');
      INSERT INTO public.ticket_batches(id,event_id,name,price_cents,quantity,active) VALUES ('${batch}','${event}','Test',1000,10,true);`);
    const reserve = async () => {
      const result = await db.query<{ r: { order_id: string; total_cents: number } }>(
        `SELECT public.reserve_tickets($1,$2::jsonb,$3,'Teste','test@example.com','','','',30) r`,
        [event, JSON.stringify([{ batch_id: batch, quantity: 2 }]), user],
      );
      return result.rows[0].r;
    };
    const apply = (key: string, order: string, amount: number) =>
      db.query(`SELECT public.apply_payment_event_srv($1,'test',$2,'confirm',$3::jsonb)`, [
        key,
        order,
        JSON.stringify({
          session_id: "cs_test_" + order,
          payment_intent: "pi_" + order,
          amount_total: amount,
          currency: "BRL",
        }),
      ]);
    const order = await reserve();
    await t.test(
      "failed amount rolls back receipt, corrected retry issues exactly once",
      async () => {
        await assert.rejects(apply("evt_retry", order.order_id, 1), /amount_mismatch/);
        assert.equal(
          (
            await db.query<{ n: number }>(
              `SELECT count(*)::int n FROM public.stripe_webhook_events WHERE stripe_event_id='evt_retry'`,
            )
          ).rows[0].n,
          0,
        );
        await apply("evt_retry", order.order_id, order.total_cents);
        await apply("evt_retry", order.order_id, order.total_cents);
        assert.equal(
          (
            await db.query<{ n: number }>(
              `SELECT count(*)::int n FROM public.tickets WHERE order_id=$1`,
              [order.order_id],
            )
          ).rows[0].n,
          2,
        );
      },
    );
    await t.test("late payment reacquires released stock", async () => {
      const late = await reserve();
      await db.query(`SELECT public.release_order($1,'expired','test')`, [late.order_id]);
      await apply("evt_late", late.order_id, late.total_cents);
      assert.deepEqual(
        (await db.query(`SELECT sold,reserved FROM public.ticket_batches WHERE id=$1`, [batch]))
          .rows[0],
        { sold: 4, reserved: 0 },
      );
    });
    await t.test("late payment cannot oversell and rolls back every mutation", async () => {
      const late = await reserve();
      await db.query(`SELECT public.release_order($1,'expired','test')`, [late.order_id]);
      await db.query(`UPDATE public.ticket_batches SET quantity=sold WHERE id=$1`, [batch]);
      await assert.rejects(
        apply("evt_soldout", late.order_id, late.total_cents),
        /late_payment_requires_manual_refund/,
      );
      assert.equal(
        (
          await db.query<{ n: number }>(
            `SELECT count(*)::int n FROM public.tickets WHERE order_id=$1`,
            [late.order_id],
          )
        ).rows[0].n,
        0,
      );
    });
    await t.test("browser cannot mutate money or call privileged receipt function", async () => {
      const { rows } = await db.query<{
        write: boolean;
        execute: boolean;
      }>(`SELECT has_table_privilege('authenticated','public.orders','UPDATE') AS write,
        has_function_privilege('authenticated','public.apply_payment_event_srv(text,text,uuid,text,jsonb)','EXECUTE') AS execute`);
      assert.deepEqual(rows[0], { write: false, execute: false });
    });
    await t.test("refunded ticket is rejected by UUID check-in", async () => {
      await db.query(`UPDATE public.tickets SET status='refunded' WHERE order_id=$1`, [
        order.order_id,
      ]);
      const { rows } = await db.query<{ r: { ok: boolean; reason: string } }>(
        `SELECT public.check_in_ticket_srv($1,(SELECT code FROM public.tickets WHERE order_id=$2 LIMIT 1)) r`,
        [user, order.order_id],
      );
      assert.equal(rows[0].r.ok, false);
      assert.equal(rows[0].r.reason, "refunded");
    });
    await t.test("reservation validates duplicates and limits pending orders", async () => {
      await db.query(`UPDATE public.ticket_batches SET quantity=100 WHERE id=$1`, [batch]);
      await assert.rejects(
        db.query(
          `SELECT public.reserve_tickets($1,$2::jsonb,$3,'Teste','test@example.com','','','',30)`,
          [
            event,
            JSON.stringify([
              { batch_id: batch, quantity: 1 },
              { batch_id: batch, quantity: 1 },
            ]),
            user,
          ],
        ),
        /duplicate_batch/,
      );
      for (let i = 0; i < 5; i++) await reserve();
      await assert.rejects(reserve(), /too_many_pending_orders/);
    });
    await t.test("role updates reject self escalation and invalid actors", async () => {
      await assert.rejects(
        db.query(`SELECT public.set_user_role_srv($1,$1,'user')`, [user]),
        /forbidden/,
      );
      await assert.rejects(
        db.query(`SELECT public.set_user_role_srv(null,$1,'admin')`, [user]),
        /forbidden/,
      );
      assert.equal(
        (
          await db.query<{ n: number }>(
            `SELECT count(*)::int n FROM public.user_roles WHERE user_id=$1 AND role='admin'`,
            [user],
          )
        ).rows[0].n,
        1,
      );
    });
  } finally {
    await db.close();
  }
});
