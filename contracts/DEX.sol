// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.4.16 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract DEX {
    using SafeMath for uint256;

    uint256 nextOrderId;
    uint256 nextTradeId;

    address public admin;

    bytes32[] public tokenList;

    bytes32 constant DAI = bytes32("DAI");

    enum Side {
        BUY,
        SELL
    }

    struct Token {
        bytes32 ticker;
        address tokenAddress;
    }

    struct Order {
        uint256 id;
        address trader;
        Side side;
        bytes32 ticker;
        uint256 amount;
        uint256 filled;
        uint256 price;
        uint256 date;
    }

    mapping(bytes32 => Token) public tokens;
    mapping(bytes32 => mapping(uint256 => Order[])) public orderBook;
    mapping(address => mapping(bytes32 => uint256)) public traderBalance;

    event newTrade(
        uint256 tradeId,
        uint256 orderId,
        bytes32 indexed ticker,
        address indexed trader1,
        address indexed trader2,
        uint256 amount,
        uint256 price,
        uint256 date
    );

    constructor() {
        admin = msg.sender;
    }

    function getOrders(bytes32 ticker, Side side)
        external
        view
        returns (Order[] memory)
    {
        return orderBook[ticker][uint256(side)];
    }

    function getTokens() external view returns (Token[] memory) {
        Token[] memory _tokens = new Token[](tokenList.length);
        for (uint256 i = 0; i < tokenList.length; i++) {
            _tokens[i] = Token(
                tokens[tokenList[i]].ticker,
                tokens[tokenList[i]].tokenAddress
            );
        }
        return _tokens;
    }

    function addToken(bytes32 ticker, address tokenAddress) external onlyAdmin {
        tokens[ticker] = Token(ticker, tokenAddress);
        tokenList.push(ticker);
    }

    function deposit(uint256 amount, bytes32 ticker)
        external
        tokenExist(ticker)
    {
        IERC20(tokens[ticker].tokenAddress).transferFrom(
            msg.sender,
            address(this),
            amount
        );
        traderBalance[msg.sender][ticker] = traderBalance[msg.sender][ticker]
            .add(amount);
    }

    function withdraw(uint256 amount, bytes32 ticker)
        external
        tokenExist(ticker)
    {
        require(
            traderBalance[msg.sender][ticker] >= amount,
            "Insufficient Balance!"
        );

        traderBalance[msg.sender][ticker] = traderBalance[msg.sender][ticker]
            .sub(amount);

        IERC20(tokens[ticker].tokenAddress).transfer(msg.sender, amount);
    }

    function createMarketOrder(
        bytes32 ticker,
        uint256 amount,
        Side side
    ) external tokenExist(ticker) tokenIsNotDai(ticker) {
        if (side == Side.SELL) {
            require(
                traderBalance[msg.sender][ticker] >= amount,
                "Token Balance is too low!"
            );
        }

        Order[] storage orders = orderBook[ticker][
            uint256(side == Side.BUY ? Side.SELL : Side.BUY)
        ];
        uint256 i;
        uint256 remaining = amount;

        while (i < orders.length && remaining > 0) {
            uint256 available = orders[i].amount.sub(orders[i].filled);
            uint256 matched = (remaining > available) ? available : remaining;
            remaining = remaining.sub(matched);
            orders[i].filled = orders[i].filled.add(matched);
            emit newTrade(
                nextTradeId,
                orders[i].id,
                ticker,
                orders[i].trader,
                msg.sender,
                matched,
                orders[i].price,
                block.timestamp
            );
            if (side == Side.SELL) {
                traderBalance[msg.sender][ticker] = traderBalance[msg.sender][
                    ticker
                ].sub(matched);
                traderBalance[msg.sender][DAI] = traderBalance[msg.sender][DAI]
                    .add(matched.mul(orders[i].price));

                traderBalance[orders[i].trader][ticker] = traderBalance[
                    orders[i].trader
                ][ticker].add(matched);
                traderBalance[orders[i].trader][DAI] = traderBalance[
                    orders[i].trader
                ][DAI].sub(matched.mul(orders[i].price));
            }

            if (side == Side.BUY) {
                require(
                    traderBalance[msg.sender][DAI] >=
                        matched.mul(orders[i].price),
                    "dai balance too low"
                );
                traderBalance[msg.sender][ticker] = traderBalance[msg.sender][
                    ticker
                ].add(matched);
                traderBalance[msg.sender][DAI] = traderBalance[msg.sender][DAI]
                    .sub(matched.mul(orders[i].price));
                traderBalance[orders[i].trader][ticker] = traderBalance[
                    orders[i].trader
                ][ticker].sub(matched);
                traderBalance[orders[i].trader][DAI] = traderBalance[
                    orders[i].trader
                ][DAI].add(matched.mul(orders[i].price));
            }
            nextTradeId++;
            i++;
        }

        i = 0;
        while (i < orders.length && orders[i].filled == orders[i].amount) {
            for (uint256 j = i; j < orders.length - 1; j++) {
                orders[j] = orders[j + 1];
            }
            orders.pop();
            i++;
        }
    }

    function createLimitOrder(
        bytes32 ticker,
        uint256 amount,
        uint256 price,
        Side side
    ) external tokenExist(ticker) tokenIsNotDai(ticker) {
        if (side == Side.SELL) {
            require(
                traderBalance[msg.sender][ticker] >= amount,
                "Token Balance is too low!"
            );
        } else {
            require(
                traderBalance[msg.sender][DAI] >= amount.mul(price),
                "DAI balance too low!"
            );
        }
        Order[] storage orders = orderBook[ticker][uint256(side)];

        orders.push(
            Order(
                nextOrderId,
                msg.sender,
                side,
                ticker,
                amount,
                0,
                price,
                block.timestamp
            )
        );

        uint256 totalOrder = orders.length > 0 ? orders.length - 1 : 0;
        //sorting
        while (totalOrder > 0) {
            if (
                side == Side.BUY &&
                orders[totalOrder - 1].price > orders[totalOrder].price
            ) {
                break;
            }
            if (
                side == Side.BUY &&
                orders[totalOrder - 1].price < orders[totalOrder].price
            ) {
                break;
            }

            Order memory order = orders[totalOrder - 1];
            orders[totalOrder - 1] = orders[totalOrder];

            orders[totalOrder] = order;
            totalOrder--;
        }

        nextOrderId++;
    }

    modifier tokenIsNotDai(bytes32 ticker) {
        require(ticker != DAI, "Token is not dai!");
        _;
    }

    modifier tokenExist(bytes32 ticker) {
        require(
            tokens[ticker].tokenAddress != address(0),
            "Token Not In The List!"
        );
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin allowed!");
        _;
    }
}
