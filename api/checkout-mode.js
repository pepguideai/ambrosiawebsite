const { readMode, readBacWater } = require('./_lib/mode');
const { noStore } = require('./_lib/http');

/* Public: the storefront asks this before checkout and to decide whether to
   show the Zelle offer. Never cached. */
module.exports = async (req, res) => {
  noStore(res);
  res.status(200).json({ mode: await readMode(), bacWater: await readBacWater() });
};
