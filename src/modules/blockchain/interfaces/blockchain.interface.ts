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
}
