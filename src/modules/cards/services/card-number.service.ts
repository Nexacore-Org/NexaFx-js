import { Injectable } from '@nestjs/common';

@Injectable()
export class CardNumberService {
  generateLuhnValidNumber(bin = '411111'): string {
    let number = bin;
    // Generate 15 digits total
    while (number.length < 15) {
      number += Math.floor(Math.random() * 10).toString();
    }
    
    // Calculate Checksum (Luhn)
    const checkDigit = this.calculateCheckDigit(number);
    return number + checkDigit;
  }

  private calculateCheckDigit(number: string): number {
    let sum = 0;
    for (let i = 0; i < number.length; i++) {
      let digit = parseInt(number[number.length - 1 - i]);
      if (i % 2 === 0) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    return (10 - (sum % 10)) % 10;
  }
}