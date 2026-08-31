require("dotenv").config();

const pool = require("../config/db");

const promoteAdmin = async () => {
  const email = String(process.argv[2] || "")
    .trim()
    .toLowerCase();
  if (!email) throw new Error("Usage: npm run admin:promote -- owner@example.com");
  const result = await pool.query(
    `UPDATE users
     SET auth_version = auth_version + CASE
           WHEN role IN ('admin', 'platform_owner') THEN 0
           ELSE 1
         END,
         role = CASE WHEN role = 'platform_owner' THEN role ELSE 'admin' END
     WHERE email = $1
     RETURNING id, name, email, role`,
    [email]
  );
  if (result.rows.length === 0) throw new Error(`No user exists with email ${email}.`);
  process.stdout.write(`Administrator access confirmed for ${result.rows[0].email}.\n`);
};

promoteAdmin()
  .then(() => pool.end())
  .catch(async (error) => {
    process.stderr.write(`${error.message}\n`);
    await pool.end();
    process.exit(1);
  });
