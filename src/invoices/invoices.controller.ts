import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, Res } from '@nestjs/common';
import { Response } from 'express';
import { InvoicesService } from './invoices.service';
import { JwtAuthGuard } from '../../guards/jwt-auth.guard';

@Controller('v2/invoices')
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Req() req: any, @Body() body: any) {
    return this.invoicesService.createInvoice(req.user.id, body);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(@Req() req: any) {
    return this.invoicesService.listInvoices(req.user.id);
  }

  @Get(':id/pay')
  async getPublicInvoiceDetails(@Param('id') id: string) {
    return this.invoicesService.getInvoiceById(id);
  }

  @Post(':id/pay')
  @UseGuards(JwtAuthGuard)
  async processPayment(@Param('id') id: string, @Req() req: any) {
    return this.invoicesService.payInvoice(id, req.user.id);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async get(@Param('id') id: string) {
    return this.invoicesService.getInvoiceById(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(@Param('id') id: string, @Req() req: any, @Body() body: any) {
    return this.invoicesService.updateInvoice(id, req.user.id, body);
  }

  @Post(':id/send')
  @UseGuards(JwtAuthGuard)
  async send(@Param('id') id: string, @Req() req: any) {
    return this.invoicesService.sendInvoice(id, req.user.id);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard)
  async cancel(@Param('id') id: string, @Req() req: any) {
    return this.invoicesService.cancelInvoice(id, req.user.id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async delete(@Param('id') id: string, @Req() req: any) {
    return this.invoicesService.deleteInvoice(id, req.user.id);
  }

  @Get(':id/pdf')
  async downloadPdf(@Param('id') id: string, @Res() res: Response) {
    const pdfData = await this.invoicesService.getInvoicePdf(id);
    res.setHeader('Content-Type', pdfData.contentType);
    res.send(pdfData.buffer);
  }
}