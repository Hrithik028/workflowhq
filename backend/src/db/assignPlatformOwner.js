require("dotenv").config();

const pool = require("../config/db");

const assignPlatformOwner = async (db, emailInput) => {
  const email = String(emailInput || "")
    .trim()
    .toLowerCase();
  if (!email) throw new Error("Usage: npm run owner:assign -- owner@example.com");

  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const targetResult = await client.query(
      "SELECT id, name, email, role FROM users WHERE email = $1 FOR UPDATE",
      [email]
    );
    if (targetResult.rows.length === 0) {
      throw new Error(`No user exists with email ${email}.`);
    }

    const target = targetResult.rows[0];
    const previousResult = await client.query(
      "SELECT id, email FROM users WHERE role = 'platform_owner' AND id <> $1 FOR UPDATE",
      [target.id]
    );

    for (const previous of previousResult.rows) {
      await client.query(
        "UPDATE users SET role = 'admin', auth_version = auth_version + 1 WHERE id = $1",
        [previous.id]
      );
      await client.query("DELETE FROM refresh_sessions WHERE user_id = $1", [previous.id]);
    }
    await client.query(
      "UPDATE users SET role = 'platform_owner', auth_version = auth_version + 1 WHERE id = $1",
      [target.id]
    );
    await client.query("DELETE FROM refresh_sessions WHERE user_id = $1", [target.id]);
    await client.query(
      `INSERT INTO admin_audit_log (admin_user_id, target_user_id, action, details)
       VALUES (NULL, $1, 'platform_owner_assigned_server', $2)`,
      [
        target.id,
        JSON.stringify({
          newOwnerEmail: target.email,
          previousOwnerEmails: previousResult.rows.map((row) => row.email)
        })
      ]
    );
    await client.query("COMMIT");
    return { ...target, role: "platform_owner" };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

if (require.main === module) {
  assignPlatformOwner(pool, process.argv[2])
    .then(async (owner) => {
      process.stdout.write(`Assigned ${owner.email} as platform owner. Existing sessions revoked.\n`);
      await pool.end();
    })
    .catch(async (error) => {
      process.stderr.write(`${error.message}\n`);
      await pool.end();
      process.exit(1);
    });
}

module.exports = { assignPlatformOwner };
