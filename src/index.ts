import { PrivateKeyWalletSubprovider, RPCSubprovider, Web3ProviderEngine } from '@0x/subproviders';
import { Web3Wrapper } from '@0x/web3-wrapper';
import * as dotenv from 'dotenv';
import * as express from 'express';
import * as _ from 'lodash';

import { PolarisContract } from './wrappers/polaris';

dotenv.load();

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (request, response) => {
  response.send('Hello from Marble!');
});

app.listen(port, async () => {
  console.log(`server is listening on ${port}`);
  await main();
});

async function main(): Promise<void> {
  const infura = 'https://mainnet.infura.io/';
  const provider = new Web3ProviderEngine();
  const privateKey = process.env.PRIVATE_KEY as string;
  provider.addProvider(new PrivateKeyWalletSubprovider(privateKey));
  provider.addProvider(new RPCSubprovider(infura));
  provider.start();
  const web3Wrapper = new Web3Wrapper(provider);
  const [address] = await web3Wrapper.getAvailableAddressesAsync();
  const polarisAddress = '0x440a803b42a78d93a1fe5da29a9fb37ecf193786';
  const polaris = PolarisContract.new(polarisAddress, provider, {
    from: address,
    gas: 600000,
  });

  let previousBlockNumber: number;
  let pokePromise: Promise<any> | undefined;
  let pokeTimestamp: number = 0;

  const daiAddress = '0x89d24a6b4ccb1b6faa2625fe562bdd9a23260359';
  setInterval(async () => {
    const blockNumber = await web3Wrapper.getBlockNumberAsync();
    console.log('BlockNumber', blockNumber);

    if (previousBlockNumber !== blockNumber) {
      previousBlockNumber = blockNumber;

      const wouldRewardPoke = await polaris.willRewardCheckpoint.callAsync(daiAddress);
      const currentTimestamp = Date.now();

      console.log('Will Reward Checkpoint: ', wouldRewardPoke);
      if (wouldRewardPoke && (_.isUndefined(pokePromise) || pokeTimedOut(currentTimestamp, pokeTimestamp))) {
        console.log('Poking!');
        pokeTimestamp = currentTimestamp;
        pokePromise = web3Wrapper.awaitTransactionMinedAsync(await polaris.poke.sendTransactionAsync(daiAddress));
        try {
          await pokePromise;
          console.log('Poke mined');
        } catch (error) {
          console.log('Error: ', error);
        }

        console.log('Clear poke data');
        pokePromise = undefined;
        pokeTimestamp = 0;
      }
    }
  }, 14000);
}

function pokeTimedOut(currentTimestamp: number, pokeTimestamp: number): boolean {
  const ONE_MINUTE_IN_MS = 60 * 1000;
  return pokeTimestamp > 0 && currentTimestamp - pokeTimestamp > ONE_MINUTE_IN_MS;
}
