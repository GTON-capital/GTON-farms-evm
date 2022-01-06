// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

// WARNING: There is a known vuln contained within this contract related to vote delegation, 
// it's NOT recommmended to use this in production.  

// RelictGtonToken with Governance.
contract RelictGtonToken is ERC20("RewardGtonToken", "rewGTON"), Ownable {
    /// @notice Creates `_amount` token to `_to`. Must only be called by the owner (BigBanger).
    function mint(address _to, uint256 _amount) public onlyOwner {
        _mint(_to, _amount);
    }
}