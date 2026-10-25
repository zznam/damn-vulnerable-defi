require("@nomicfoundation/hardhat-toolbox");

module.exports = {
  solidity: {
    version: "0.6.12",
  },
  paths: {
    artifacts: "./build/contracts",
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        count: 20,
        accountsBalance: "1000000000000000000000000",
      },
    },
  },
  mocha: {
    timeout: 5000,
  },
};
