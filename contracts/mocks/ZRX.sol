// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.4.16 <0.9.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Zrx is ERC20 {
    
    constructor() ERC20('Zrx Token', "ZRX"){}
    
    function faucet(address to, uint amount) external {
        _mint(to, amount);
    }
}