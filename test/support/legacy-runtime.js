const { ethers, network } = require("hardhat");
const { HDNodeWallet, parseEther } = require("ethers");
const chai = require("chai");
const fs = require("node:fs");
const path = require("node:path");

const mnemonic = "test test test test test test test test test test test junk";
const accounts = Array.from({ length: 20 }, (_, index) =>
  HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`).address,
);

function asBigInt(value) {
  return BigInt(value?.toString?.() ?? value);
}

function compareBigInt(actual, expected, operation) {
  const left = asBigInt(actual);
  const right = asBigInt(expected);
  const result = operation(left, right);
  chai.util.flag(this, "defi.bigint", false);
  this.assert(
    result,
    `expected ${left} to satisfy the numeric comparison with ${right}`,
    `expected ${left} not to satisfy the numeric comparison with ${right}`,
    right.toString(),
    left.toString(),
  );
}

chai.Assertion.addProperty("bignumber", function () {
  chai.util.flag(this, "defi.bigint", true);
});

for (const [method, operation] of [
  ["equal", (left, right) => left === right],
  ["equals", (left, right) => left === right],
  ["eq", (left, right) => left === right],
  ["gt", (left, right) => left > right],
  ["gte", (left, right) => left >= right],
]) {
  chai.Assertion.overwriteMethod(method, function (original) {
    return function (expected, ...args) {
      if (!chai.util.flag(this, "defi.bigint")) {
        return original.apply(this, [expected, ...args]);
      }
      return compareBigInt.call(this, this._obj, expected, operation);
    };
  });
}

function transactionOptions(args) {
  const last = args.at(-1);
  if (!last || typeof last !== "object" || Array.isArray(last)) {
    return { args, options: {} };
  }
  args.pop();
  const { from, ...options } = last;
  return { args, from, options };
}

async function signerFor(address) {
  return address ? ethers.getSigner(address) : (await ethers.getSigners())[0];
}

function decodeReceipt(receipt, contractInterface) {
  const logs = receipt.logs.map((log) => {
    try {
      const parsed = contractInterface.parseLog(log);
      return { ...log, event: parsed.name, args: parsed.args };
    } catch {
      return log;
    }
  });
  return { ...receipt, logs };
}

function wrapContract(contractInstance) {
  return new Proxy(contractInstance, {
    get(target, property) {
      if (property === "address") return target.target;
      const value = Reflect.get(target, property, target);
      if (typeof value !== "function" || property === "then") return value;

      return async (...callArgs) => {
        const { args, from, options } = transactionOptions(callArgs);
        const connected = from ? target.connect(await signerFor(from)) : target;
        const result = await connected[property](...args, options);
        if (result && typeof result.wait === "function") {
          return decodeReceipt(await result.wait(), target.interface);
        }
        return result;
      };
    },
  });
}

async function artifactFactory(name, signer, artifactsDir) {
  if (!artifactsDir) {
    return ethers.getContractFactory(name, signer);
  }
  const artifactPath = path.resolve(process.cwd(), artifactsDir, `${name}.json`);
  if (!fs.existsSync(artifactPath)) {
    return ethers.getContractFactory(name, signer);
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  return new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
}

const contract = {
  artifactsDir: null,
  fromArtifact(name) {
    const artifactsDir = this.artifactsDir;
    return {
      async new(...constructorArgs) {
        const { args, from, options } = transactionOptions(constructorArgs);
        const factory = await artifactFactory(name, await signerFor(from), artifactsDir);
        const instance = await factory.deploy(...args, options);
        await instance.waitForDeployment();
        return wrapContract(instance);
      },
      async at(address) {
        const factory = await artifactFactory(name, await signerFor(), artifactsDir);
        return wrapContract(factory.attach(address));
      },
    };
  },
};

const web3 = {
  eth: {
    async getBlock(tag) {
      const blockTag = tag === "latest" ? "latest" : `0x${Number(tag).toString(16)}`;
      const block = await network.provider.send("eth_getBlockByNumber", [blockTag, false]);
      return { ...block, timestamp: Number(BigInt(block.timestamp)) };
    },
    async sendTransaction({ from, to, value }) {
      const signer = await signerFor(from);
      const transaction = await signer.sendTransaction({ to, value: asBigInt(value) });
      return transaction.wait();
    },
  },
};

const balance = {
  async current(address) {
    return ethers.provider.getBalance(address);
  },
};

const duration = {
  seconds: (value) => Number(value),
  minutes: (value) => Number(value) * 60,
  hours: (value) => Number(value) * 60 * 60,
  days: (value) => Number(value) * 24 * 60 * 60,
};

const time = {
  duration,
  async increase(seconds) {
    await network.provider.send("evm_increaseTime", [Number(seconds)]);
    await network.provider.send("evm_mine");
  },
};

const expectRevert = {
  async unspecified(promise) {
    await chai.expect(promise).to.be.reverted;
  },
};

module.exports = {
  accounts,
  balance,
  contract,
  ether: (value) => parseEther(String(value)),
  expectRevert,
  time,
  web3,
};
