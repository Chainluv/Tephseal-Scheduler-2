// /api/admin-pass.js
module.exports = async (_req, res) => {
  const pass =
    process.env.ADMIN_PASS ||
    process.env.NEXT_PUBLIC_ADMIN_PASS ||
    'admin123'; // fallback
  res.status(200).json({ ok: true, pass });
};
