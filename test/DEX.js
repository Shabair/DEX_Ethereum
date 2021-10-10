const { expectRevert } = require("@openzeppelin/test-helpers");
const Dai = artifacts.require("Dai");
const Bat = artifacts.require("Bat");
const Rep = artifacts.require("Rep");
const Zrx = artifacts.require("Zrx");
const Dex = artifacts.require("DEX");

const Side = {
  BUY: 0,
  SELL: 1,
};

contract("DEX", (accounts) => {
  let dai, bat, rep, zrx, dex;

  const [DAI, BAT, REP, ZRX] = ["DAI", "BAT", "REP", "ZRX"].map((ticker) =>
    web3.utils.fromAscii(ticker)
  );

  const [trader1, trader2] = [accounts[1], accounts[2]];

  beforeEach(async () => {
    [dai, bat, rep, zrx] = await Promise.all([
      Dai.new(),
      Bat.new(),
      Rep.new(),
      Zrx.new(),
    ]);
    dex = await Dex.new();
    await Promise.all([
      dex.addToken(DAI, dai.address),
      dex.addToken(BAT, bat.address),
      dex.addToken(REP, rep.address),
      dex.addToken(ZRX, zrx.address),
    ]);

    const amount = web3.utils.toWei("1000");
    const seedTokenBalance = async (token, trader) => {
      await token.faucet(trader, amount);
      await token.approve(dex.address, amount, { from: trader });
    };

    await Promise.all(
      [dai, bat, rep, zrx].map((token) => seedTokenBalance(token, trader1))
    );

    await Promise.all(
      [dai, bat, rep, zrx].map((token) => seedTokenBalance(token, trader2))
    );
  });

  it("should deposit token", async () => {
    const amount = web3.utils.toWei("100");

    await dex.deposit(amount, DAI, { from: trader1 });

    const balance = await dex.traderBalance(trader1, DAI);

    assert.equal(balance.toString(), amount, "Dai balance is not equal!");
  });

  it("should not deposit tokens if token does not exist", async () => {
    const amount = web3.utils.toWei("100");

    await expectRevert(
      dex.deposit(amount, web3.utils.fromAscii("ABC"), { from: trader1 }),
      "Token Not In The List!"
    );
  });

  it("should withdraw tokens", async () => {
    const amount = web3.utils.toWei("100");

    await dex.deposit(amount, DAI, { from: trader1 });

    await dex.withdraw(amount, DAI, { from: trader1 });

    const [balanceDex, balanceDai] = await Promise.all([
      dex.traderBalance(trader1, DAI),
      dai.balanceOf(trader1),
    ]);

    assert(balanceDex.isZero());
    assert.equal(
      balanceDai.toString(),
      web3.utils.toWei("1000"),
      "Dai balance is not equal!"
    );
  });

  it("should not withdraw tokens if token does not exist", async () => {
    const amount = web3.utils.toWei("100");

    await expectRevert(
      dex.withdraw(amount, web3.utils.fromAscii("ABC"), { from: trader1 }),
      "Token Not In The List!"
    );
  });

  it("should NOT withdraw tokens if balance is low", async () => {
    const amount = web3.utils.toWei("100");

    await dex.deposit(amount, DAI, { from: trader1 });

    await expectRevert(
      dex.withdraw(web3.utils.toWei("1000"), DAI, { from: trader1 }),
      "Insufficient Balance!"
    );
  });

  it("Should create limit order", async () => {
    const amount = web3.utils.toWei("100");

    await dex.deposit(amount, DAI, { from: trader1 });

    await dex.createLimitOrder(ZRX, web3.utils.toWei("10"), 10, Side.BUY, {
      from: trader1,
    });

    let buyOrders = await dex.getOrders(ZRX, Side.BUY);
    let sellOrders = await dex.getOrders(ZRX, Side.SELL);

    assert.equal(buyOrders.length, 1, "Buy limit order length is not equal");
    assert.equal(buyOrders[0].trader, trader1, "Buy limit order Trader Error");
    assert.equal(
      buyOrders[0].ticker,
      web3.utils.padRight(ZRX, 64),
      "Buy limit order Ticker Error"
    );
    assert.equal(buyOrders[0].price, "10", "Buy limit order Price Error");
    assert.equal(
      buyOrders[0].amount,
      web3.utils.toWei("10"),
      "Buy limit order length is not equal"
    );
    assert.equal(sellOrders.length, 0, "Sell limit order length");
    //Trader 2
    await dex.deposit(web3.utils.toWei("200"), DAI, { from: trader2 });
    await dex.createLimitOrder(ZRX, web3.utils.toWei("12"), 10, Side.BUY, {
      from: trader2,
    });

    //
    await dex.deposit(web3.utils.toWei("100"), DAI, { from: trader2 });
    await dex.createLimitOrder(ZRX, web3.utils.toWei("10"), 9, Side.BUY, {
      from: trader2,
    });

    buyOrders = await dex.getOrders(ZRX, Side.BUY);
    sellOrders = await dex.getOrders(ZRX, Side.SELL);
    console.log(buyOrders[1]);
    assert.equal(buyOrders.length, 3, "Buy limit order length is not equal");
    assert.equal(
      buyOrders[0].trader,
      trader2,
      "Buy limit order Trader 2 Error"
    );
    assert.equal(
      buyOrders[1].trader,
      trader1,
      "Buy limit order Trader 1 Error"
    );
    assert.equal(
      buyOrders[2].trader,
      trader2,
      "Buy limit order Trader 2 Error!"
    );
    assert.equal(
      buyOrders[0].ticker,
      web3.utils.padRight(ZRX, 64),
      "Buy limit order Ticker Error"
    );
    assert.equal(buyOrders[0].price, "10", "Buy limit order Price Error");
    assert.equal(
      buyOrders[0].amount,
      web3.utils.toWei("12"),
      "Buy limit order length is not equal"
    );
    assert.equal(
      buyOrders[1].amount,
      web3.utils.toWei("10"),
      "Buy limit order length is not equal"
    );
    assert.equal(
      buyOrders[2].amount,
      web3.utils.toWei("10"),
      "Buy limit order length is not equal"
    );
    assert.equal(buyOrders[2].price, "9", "Buy limit order Price Error");
  });
});
