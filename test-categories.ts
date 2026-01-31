/**
 * Test script for transaction categorization endpoints
 * Run after starting the server and ensuring database is connected
 */

import axios from 'axios';

interface Category {
  id: string;
  name: string;
  description: string;
  keywords: string[];
  merchantTags: string[] | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateCategoryDto {
  name: string;
  description?: string;
  keywords?: string[];
  merchantTags?: string[];
}

interface AssignCategoryDto {
  categoryId: string;
}

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  meta?: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

const BASE_URL = 'http://localhost:3000';

async function testCategories(): Promise<void> {
  console.log('=== Transaction Categorization Tests ===\n');

  try {
    // 1. Create categories
    console.log('1. Creating categories...');
    
    const categories: CreateCategoryDto[] = [
      { 
        name: 'Bills', 
        description: 'Utility bills and recurring payments', 
        keywords: ['electricity', 'water', 'internet', 'rent'] 
      },
      { 
        name: 'Transfers', 
        description: 'Money transfers between accounts', 
        keywords: ['transfer', 'send money', 'receive money'] 
      },
      { 
        name: 'Savings', 
        description: 'Savings deposits and investments', 
        keywords: ['savings', 'deposit', 'investment'] 
      },
      { 
        name: 'Shopping', 
        description: 'Retail purchases and online shopping', 
        keywords: ['amazon', 'walmart', 'shopping', 'purchase'] 
      }
    ];

    const createdCategories: Category[] = [];
    
    for (const cat of categories) {
      try {
        const response = await axios.post<ApiResponse<Category>>(
          `${BASE_URL}/transactions/categories`, 
          cat
        );
        console.log(`✓ Created category: ${response.data.data.name} (${response.data.data.id})`);
        createdCategories.push(response.data.data);
      } catch (error: any) {
        console.log(`✗ Failed to create category ${cat.name}:`, error.response?.data || error.message);
      }
    }

    console.log('\n2. Listing all categories...');
    try {
      const response = await axios.get<ApiResponse<Category[]>>(
        `${BASE_URL}/transactions/categories`
      );
      console.log('✓ Categories retrieved:', response.data.data.map(c => c.name));
    } catch (error: any) {
      console.log('✗ Failed to list categories:', error.response?.data || error.message);
    }

    console.log('\n3. Assigning category to transaction...');
    // Note: You need a valid transaction ID from your database
    const sampleTransactionId: string = 'YOUR_TRANSACTION_ID_HERE';
    
    if (createdCategories.length > 0) {
      try {
        const response = await axios.patch<ApiResponse<null>>(
          `${BASE_URL}/transactions/${sampleTransactionId}/category`,
          { categoryId: createdCategories[0].id } as AssignCategoryDto
        );
        console.log('✓ Category assigned:', response.data.message);
      } catch (error: any) {
        console.log('✗ Failed to assign category:', error.response?.data || error.message);
      }
    }

    console.log('\n4. Searching transactions by category...');
    if (createdCategories.length > 0) {
      try {
        const response = await axios.get<ApiResponse<any[]>>(
          `${BASE_URL}/transactions/search?categoryId=${createdCategories[0].id}`
        );
        console.log(`✓ Found ${response.data.meta?.total || 0} transactions in category ${createdCategories[0].name}`);
      } catch (error: any) {
        console.log('✗ Failed to search by category:', error.response?.data || error.message);
      }
    }

  } catch (error: any) {
    console.error('Test failed:', error.message);
  }
}

// Run tests
testCategories();
