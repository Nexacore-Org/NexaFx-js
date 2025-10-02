import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report, ReportStatus } from '../entities/report.entity';
// Assume a 'Transaction' entity exists
import { Transaction } from '../../transactions/entities/transaction.entity';
import { Parser } from 'json2csv';
import * as fs from 'fs';

@Processor('reports')
export class ReportProcessor {
  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
  ) {}

  @Process('generate-report')
  async handleGenerateReport(job: Job<{ reportId: string }>) {
    const { reportId } = job.data;
    const report = await this.reportRepository.findOne({ where: { id: reportId } });
    
    try {
        // Fetch all transactions for the user (in a real app, use filters)
        const transactions = await this.transactionRepository.find({ where: { senderId: report.userId } });

        // Generate the file (example for CSV)
        const parser = new Parser();
        const csv = parser.parse(transactions);
        const filePath = `./reports/${reportId}.csv`;
        
        fs.writeFileSync(filePath, csv);

        // Update the report record in the database
        report.status = ReportStatus.COMPLETED;
        report.fileUrl = filePath;
        await this.reportRepository.save(report);

    } catch (error) {
        report.status = ReportStatus.FAILED;
        await this.reportRepository.save(report);
    }
  }
}