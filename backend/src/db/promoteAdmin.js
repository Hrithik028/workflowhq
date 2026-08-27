require("dotenv").config();

const pool = require("../config/db");

const promoteAdmin = async () => {
  const email = String(process.argv[2] || "")
    .trim()
    .toLowerCase();
  if (!email) throw new Error("Usage: npm run admin:promote -- owner@example.com");
  const result = await pool.query(
    "UPDATE users SET role = 'admin' WHERE email = $1 RETURNING id, name, email, role",
    [email]
  );
  if (result.rows.length === 0) throw new Error(`No user exists with email ${email}.`);
  process.stdout.write(`Promoted ${result.rows[0].email} to administrator.\n`);
};

promoteAdmin()
  .then(() => pool.end())
  .catch(async (error) => {
    process.stderr.write(`${error.message}\n`);
    await pool.end();
    process.exit(1);
  });
