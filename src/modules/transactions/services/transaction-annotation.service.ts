import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets, Between, In } from 'typeorm';
import { TransactionEntity } from '../entities/transaction.entity';
import { TransactionNoteEntity } from '../entities/transaction-note.entity';
import { TransactionTagEntity } from '../entities/transaction-tag.entity';

@Injectable()
export class TransactionAnnotationService {
  constructor(
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    @InjectRepository(TransactionNoteEntity)
    private readonly noteRepo: Repository<TransactionNoteEntity>,
    @InjectRepository(TransactionTagEntity)
    private readonly tagRepo: Repository<TransactionTagEntity>,
  ) {}

  async addNote(transactionId: string, userId: string, content: string): Promise<TransactionNoteEntity> {
    const transaction = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const note = this.noteRepo.create({
      transactionId,
      userId,
      content,
      searchVector: this.generateSearchVector(content),
    });

    return this.noteRepo.save(note);
  }

  async getNotes(transactionId: string, userId: string): Promise<TransactionNoteEntity[]> {
    const transaction = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return this.noteRepo.find({
      where: { transactionId, userId },
      order: { createdAt: 'desc' },
    });
  }

  async addTag(transactionId: string, userId: string, tag: string): Promise<TransactionTagEntity> {
    const transaction = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const normalizedTag = tag.toLowerCase().trim();
    
    const existingTag = await this.tagRepo.findOne({
      where: { transactionId, userId, tag: normalizedTag },
    });

    if (existingTag) {
      return existingTag;
    }

    const newTag = this.tagRepo.create({
      transactionId,
      userId,
      tag: normalizedTag,
    });

    return this.tagRepo.save(newTag);
  }

  async removeTag(transactionId: string, userId: string, tag: string): Promise<void> {
    const normalizedTag = tag.toLowerCase().trim();
    
    const result = await this.tagRepo.delete({
      transactionId,
      userId,
      tag: normalizedTag,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Tag not found');
    }
  }

  async getTags(transactionId: string, userId: string): Promise<TransactionTagEntity[]> {
    const transaction = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    return this.tagRepo.find({
      where: { transactionId, userId },
      order: { createdAt: 'asc' },
    });
  }

  async searchTransactionsByTag(userId: string, tag: string, page = 1, limit = 20): Promise<{ transactions: TransactionEntity[], total: number }> {
    const normalizedTag = tag.toLowerCase().trim();
    
    const [taggedTransactions, total] = await this.tagRepo.findAndCount({
      where: { userId, tag: normalizedTag },
      relations: ['transaction'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'desc' },
    });

    const transactions = taggedTransactions.map(tt => tt.transaction);

    return { transactions, total };
  }

  async searchTransactionsByNotes(userId: string, query: string, page = 1, limit = 20): Promise<{ transactions: TransactionEntity[], total: number }> {
    const [notes, total] = await this.noteRepo
      .createQueryBuilder('note')
      .leftJoinAndSelect('note.transaction', 'transaction')
      .where('note.userId = :userId', { userId })
      .andWhere('note.content ILIKE :query', { query: `%${query}%` })
      .orWhere('note.searchVector @@ plainto_tsquery(:query)', { query })
      .skip((page - 1) * limit)
      .take(limit)
      .orderBy('note.createdAt', 'desc')
      .getManyAndCount();

    const transactions = notes.map(note => note.transaction).filter(Boolean);

    return { transactions, total };
  }

  async getUserTags(userId: string): Promise<{ tag: string, count: number }[]> {
    const result = await this.tagRepo
      .createQueryBuilder('tag')
      .select('tag.tag', 'tag')
      .addCount('tag.id', 'count')
      .where('tag.userId = :userId', { userId })
      .groupBy('tag.tag')
      .orderBy('count', 'desc')
      .addOrderBy('tag', 'asc')
      .getRawMany();

    return result.map(row => ({ tag: row.tag, count: parseInt(row.count) }));
  }

  async bulkTagTransactions(
    userId: string,
    filter: any,
    tag: string,
    maxTransactions = 200
  ): Promise<{ tagged: number, skipped: number }> {
    const normalizedTag = tag.toLowerCase().trim();
    
    const transactions = await this.transactionRepo.find({
      where: filter,
      take: maxTransactions,
    });

    let tagged = 0;
    let skipped = 0;

    for (const transaction of transactions) {
      const existingTag = await this.tagRepo.findOne({
        where: { transactionId: transaction.id, userId, tag: normalizedTag },
      });

      if (!existingTag) {
        await this.tagRepo.save({
          transactionId: transaction.id,
          userId,
          tag: normalizedTag,
        });
        tagged++;
      } else {
        skipped++;
      }
    }

    return { tagged, skipped };
  }

  async getTagAnalytics(userId: string, startDate?: Date, endDate?: Date): Promise<any[]> {
    const query = this.tagRepo
      .createQueryBuilder('tag')
      .leftJoinAndSelect('tag.transaction', 'transaction')
      .select('tag.tag', 'tag')
      .addSum('transaction.amount', 'totalAmount')
      .addCount('tag.id', 'transactionCount')
      .where('tag.userId = :userId', { userId })
      .andWhere('transaction.status = :status', { status: 'SUCCESS' });

    if (startDate && endDate) {
      query.andWhere('transaction.createdAt BETWEEN :startDate AND :endDate', { startDate, endDate });
    }

    const result = await query
      .groupBy('tag.tag')
      .orderBy('totalAmount', 'desc')
      .getRawMany();

    return result.map(row => ({
      tag: row.tag,
      totalAmount: parseFloat(row.totalAmount) || 0,
      transactionCount: parseInt(row.transactionCount) || 0,
    }));
  }

  private generateSearchVector(content: string): string {
    return `to_tsvector('english', '${content.replace(/'/g, "''")}')`;
  }

  async getTransactionWithAnnotations(transactionId: string, userId: string): Promise<TransactionEntity & { notes: TransactionNoteEntity[], tags: TransactionTagEntity[] }> {
    const transaction = await this.transactionRepo.findOne({ where: { id: transactionId } });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    const [notes, tags] = await Promise.all([
      this.getNotes(transactionId, userId),
      this.getTags(transactionId, userId),
    ]);

    return Object.assign(transaction, { notes, tags });
  }
}
