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

    //Trader 2
    await dex.deposit(web3.utils.toWei("100"), DAI, { from: trader2 });
    await dex.createLimitOrder(ZRX, web3.utils.toWei("10"), 9, Side.BUY, {
      from: trader2,
    });

    buyOrders = await dex.getOrders(ZRX, Side.BUY);
    sellOrders = await dex.getOrders(ZRX, Side.SELL);

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

  it("Should not create limit order if token does not exist", async () => {
    await expectRevert(
      dex.createLimitOrder(
        web3.utils.fromAscii("ABC"),
        web3.utils.toWei("1000"),
        10,
        Side.BUY,
        { from: trader1 }
      ),
      "Token Not In The List!"
    );
  });

  it("Should not create limit order for DAI token", async () => {
    await expectRevert(
      dex.createLimitOrder(DAI, web3.utils.toWei("1000"), 10, Side.BUY, {
        from: trader1,
      }),
      "Token is not dai!"
    );
  });

  it("should not create limit order if balance is low", async () => {
    await dex.deposit(web3.utils.toWei("200"), ZRX, { from: trader1 });
    //
    await expectRevert(
      dex.createLimitOrder(ZRX, web3.utils.toWei("1000"), 10, Side.SELL, {
        from: trader1,
      }),
      "Token Balance is too low!"
    );
  });
  //
  it("should not create limit order if Dai balance is low", async () => {
    await dex.deposit(web3.utils.toWei("200"), DAI, { from: trader1 });
    //
    await expectRevert(
      dex.createLimitOrder(ZRX, web3.utils.toWei("1000"), 10, Side.BUY, {
        from: trader1,
      }),
      "DAI balance too low!"
    );
  });

  it("should create market order & match", async () => {
    await dex.deposit(web3.utils.toWei("100"), DAI, { from: trader1 });

    await dex.createLimitOrder(REP, web3.utils.toWei("10"), 10, Side.BUY, {
      from: trader1,
    });

    await dex.deposit(web3.utils.toWei("100"), REP, { from: trader2 });

    await dex.createMarketOrder(REP, web3.utils.toWei("5"), Side.SELL, {
      from: trader2,
    });

    const balances = await Promise.all([
      dex.traderBalance(trader1, DAI),
      dex.traderBalance(trader1, REP),
      dex.traderBalance(trader2, DAI),
      dex.traderBalance(trader2, REP),
    ]);
    const orders = await dex.getOrders(REP, Side.BUY);
    assert.equal(orders.length, 1);
    assert.equal(orders[0].filled, web3.utils.toWei("5"));
    assert.equal(
      balances[0].toString(),
      web3.utils.toWei("50"),
      "Trader 1 DAI Balance"
    );
    assert.equal(
      balances[1].toString(),
      web3.utils.toWei("5"),
      "Trader 1 REP Balance"
    );
    assert.equal(
      balances[2].toString(),
      web3.utils.toWei("50"),
      "Trader 2 DAI Balance"
    );
    assert.equal(
      balances[3].toString(),
      web3.utils.toWei("95"),
      "Trader 2 REP Balance"
    );
  });

  it("should NOT create market order if token balance too low", async () => {
    await expectRevert(
      dex.createMarketOrder(REP, web3.utils.toWei("101"), Side.SELL, {
        from: trader2,
      }),
      "Token Balance is too low!"
    );
  });

  it("should NOT create market order if dai balance too low", async () => {
    await dex.deposit(web3.utils.toWei("100"), REP, { from: trader1 });

    await dex.createLimitOrder(REP, web3.utils.toWei("100"), 10, Side.SELL, {
      from: trader1,
    });

    await expectRevert(
      dex.createMarketOrder(REP, web3.utils.toWei("101"), Side.BUY, {
        from: trader2,
      }),
      "dai balance too low"
    );
  });

  it("should NOT create market order if token is DAI", async () => {
    await expectRevert(
      dex.createMarketOrder(DAI, web3.utils.toWei("1000"), Side.BUY, {
        from: trader1,
      }),
      "Token is not dai!"
    );
  });

  it("should NOT create market order if token does not not exist", async () => {
    await expectRevert(
      dex.createMarketOrder(
        web3.utils.fromAscii("ABC"),
        web3.utils.toWei("1000"),
        Side.BUY,
        { from: trader1 }
      ),
      "Token Not In The List!"
    );
  });
});
