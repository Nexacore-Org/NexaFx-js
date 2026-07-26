import axios from 'axios';

/**
 * Fund a Stellar testnet wallet via the app's /api/v1/admin/dev/fund-wallet endpoint.
 * Only works when STELLAR_NETWORK=TESTNET and NODE_ENV !== 'production'.
 */
export async function fundStellarWallet(
  baseUrl: string,
  address: string,
  authToken: string,
): Promise<void> {
  await axios.post(
    `${baseUrl}/api/v1/admin/dev/fund-wallet`,
    { address },
    { headers: { Authorization: `Bearer ${authToken}` } },
  );
}
