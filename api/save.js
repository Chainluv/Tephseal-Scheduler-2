// /api/save.js
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const { weekISO, data } = req.body || {};
    if (!weekISO || !data) return res.status(400).send('Missing weekISO or data');

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER; // e.g. 'Chainluv'
    const repo  = process.env.GITHUB_REPO;  // e.g. 'Tephseal-Schedule-App'
    const path  = `data/${weekISO}.json`;

    if (!token || !owner || !repo) return res.status(500).send('Missing repo env');

    const headers = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    };

    // get existing SHA if file already exists
    let sha;
    const getResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, { headers });
    if (getResp.ok) { const j = await getResp.json(); sha = j.sha; }

    const payload = {
      message: `update schedule ${weekISO}`,
      content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
      branch: 'main',
      sha
    };

    const putResp = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
      method: 'PUT', headers, body: JSON.stringify(payload)
    });

    if (!putResp.ok) {
      const t = await putResp.text();
      return res.status(500).send(t || 'GitHub write failed');
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).send(e.message || 'Unknown error');
  }
};
