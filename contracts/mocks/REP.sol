// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.4.16 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Rep is ERC20 {
    constructor() ERC20("Rep Token", "REP") {}

    function faucet(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
