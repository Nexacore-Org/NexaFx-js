import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const VALID_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'HKD', 'NZD',
  'SEK', 'KRW', 'SGD', 'NOK', 'MXN', 'INR', 'BRL', 'ZAR', 'NGN', 'GHS',
  'BTC', 'ETH', 'USDT', 'BNB', 'XRP', 'ADA', 'SOL', 'DOT', 'MATIC', 'LTC',
];

const VALID_LANGUAGES = [
  'en', 'fr', 'es', 'de', 'pt', 'zh', 'ja', 'ko', 'ar', 'ru',
  'it', 'nl', 'pl', 'tr', 'sv', 'da', 'fi', 'no', 'hi', 'ha',
];

export { VALID_CURRENCIES, VALID_LANGUAGES };

export class UpdateUserSettingsDto {
  @ApiPropertyOptional({ example: 'USD', description: 'ISO 4217 currency code or crypto symbol' })
  @IsOptional()
  @IsString()
  @Matches(new RegExp(`^(${VALID_CURRENCIES.join('|')})$`), {
    message: `displayCurrency must be one of: ${VALID_CURRENCIES.join(', ')}`,
  })
  displayCurrency?: string;

  @ApiPropertyOptional({ example: 'en', description: 'BCP-47 language tag' })
  @IsOptional()
  @IsString()
  @Matches(new RegExp(`^(${VALID_LANGUAGES.join('|')})$`), {
    message: `language must be one of: ${VALID_LANGUAGES.join(', ')}`,
  })
  language?: string;

  @ApiPropertyOptional({ example: 'Africa/Lagos', description: 'IANA timezone name' })
  @IsOptional()
  @IsString()
  @Length(3, 100)
  timezone?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  emailNotifications?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  smsNotifications?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  pushNotifications?: boolean;

  @ApiPropertyOptional({ example: 'system', enum: ['light', 'dark', 'system'] })
  @IsOptional()
  @IsString()
  @Matches(/^(light|dark|system)$/)
  theme?: 'light' | 'dark' | 'system';
}
