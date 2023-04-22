const { GraphQLClient, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');

const CHAINS = ['polygon', 'optimism', 'ethereum', 'arbitrum', 'bsc'];

const GRAPH_CLIENTS = {
  ethereum: new GraphQLClient('https://api.thegraph.com/subgraphs/name/ilyamk/quadrat-v1-ethereum'),
  polygon: new GraphQLClient('https://api.thegraph.com/subgraphs/name/ilyamk/quadrat-v1-polygon'),
  arbitrum: new GraphQLClient('https://api.thegraph.com/subgraphs/name/ilyamk/quadrat-v1-arbitrum'),
  optimism: new GraphQLClient('https://api.thegraph.com/subgraphs/name/ilyamk/quadrat-v1-optimism'),
  bsc: new GraphQLClient('https://api.thegraph.com/subgraphs/name/ilyamk/quadrat-v1-bnb'),
};

const GRAPH_QUERY = gql`
    query strategies ($timestamp: Int! $skip: Int! $first: Int!) {
        strategies(skip: $skip first: $first) {
            meta {
                token0 {
                    id
                    decimals
                }
                token1 {
                    id
                    decimals
                }
            }
            history (orderBy: timestamp orderDirection: desc skip:0 first: 1 where: { timestamp_gte: $timestamp timeframe: ONE_HOUR }) {
                tvlToken0
                tvlToken1
            }
        }
    }
`;

function chainTvlFactory(chain) {
  return async (timestamp) => {
    timestamp = Math.floor(timestamp / 3600) * 3600;
    const graphQLClient = GRAPH_CLIENTS[chain];
    const result = await graphQLClient.request(GRAPH_QUERY, { timestamp, skip: 0, first: 1000 });
    if (!Array.isArray(result.strategies)) {
      return {};
    }


    const balances = {};

    result.strategies.forEach(strategy => {
      const timeframe = strategy.history[0];
      if (timeframe) {
        const tvlToken0Raw = new BigNumber(timeframe.tvlToken0).times(new BigNumber(10).pow(+strategy.meta.token0.decimals)).toFixed(0, 1);
        const tvlToken1Raw = new BigNumber(timeframe.tvlToken1).times(new BigNumber(10).pow(+strategy.meta.token1.decimals)).toFixed(0, 1);

        sdk.util.sumSingleBalance(balances, strategy.meta.token0.id, tvlToken0Raw);
        sdk.util.sumSingleBalance(balances, strategy.meta.token1.id, tvlToken1Raw);
      }
    });

    return balances;
  };
}

module.exports = {
  timetravel: true,
  misrepresentedTokens: false,
  methodology: 'Counts the tokens locked in Strategy Vaults in Uniswap v3 Pools.',
  start: 1667197843, // Mon Oct 31 2022 06:30:43 GMT+0000
  ...CHAINS.reduce((tvls, chain) => {
    tvls[chain] = {
      tvl: chainTvlFactory(chain),
    };
    return tvls;
  }, {}),
};
