/**
 * BlockchainService interface for testability and abstraction
 */
export interface IBlockchainService {
  /**
   * Get transaction receipt from the blockchain
   * @param txHash The transaction hash to retrieve
   * @returns Transaction receipt with block number and validity status
   */
  getTransactionReceipt(
    txHash: string,
  ): Promise<{ blockNumber: number; isValid: boolean; confirmations: number }>;

  /**
   * Get the current block number from the blockchain
   * @returns The latest block number
   */
  getCurrentBlock(): Promise<number>;

  /**
   * Get the status of a transaction from the blockchain
   * @param txHash The transaction hash
   * @returns 'SUCCESS', 'FAILED', or null if not found/pending
   */
  getTransactionStatus(txHash: string): Promise<string | null>;

  /**
   * Get on-chain balance for a given address
   * @param address The wallet address
   * @returns Balance as a decimal string (in ETH/native units)
   */
  getBalance(address: string): Promise<string>;

  /**
   * Broadcast a signed transaction to the network
   * @param signedTx Hex-encoded signed transaction
   * @returns Transaction hash
   */
  broadcastTransaction(signedTx: string): Promise<string>;
}
