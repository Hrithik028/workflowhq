const proxyAddress = require("proxy-addr");

describe("proxy address trust boundary", () => {
  it("does not trust arbitrary IPv4 clients through an IPv6 short-prefix subnet", () => {
    const trust = proxyAddress.compile(["::ffff:10.0.0.0/8"]);
    expect(trust("203.0.113.7", 0)).toBe(false);
  });

  it("preserves correctly scoped IPv4-mapped proxy subnets", () => {
    const trust = proxyAddress.compile(["::ffff:10.0.0.0/104"]);
    expect(trust("10.20.1.4", 0)).toBe(true);
    expect(trust("203.0.113.7", 0)).toBe(false);
  });
});
