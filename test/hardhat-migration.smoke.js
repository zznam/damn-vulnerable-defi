const { expect } = require("chai");
const { accounts, contract, ether } = require("./support/legacy-runtime");

const DamnValuableToken = contract.fromArtifact("DamnValuableToken");

describe("Hardhat test harness", function () {
  it("deploys contracts and sends a transaction from the selected account", async function () {
    const [deployer, recipient] = accounts;
    const token = await DamnValuableToken.new({ from: deployer });

    expect(await token.balanceOf(deployer)).to.be.bignumber.equal(2n ** 256n - 1n);
    await token.transfer(recipient, ether("10"), { from: deployer });
    expect(await token.balanceOf(recipient)).to.be.bignumber.equal(ether("10"));
  });
});
