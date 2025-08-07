import { test, expect } from '@playwright/test';

test.describe('Homepage and Navigation', () => {
  test('homepage loads correctly', async ({ page }) => {
    await page.goto('/');
    
    // Check that the page loads with correct title
    await expect(page).toHaveTitle('Tea 4 Chat');
    
    // Check for main heading
    await expect(page.getByRole('heading', { name: 'Tea 4 Chat' })).toBeVisible();
    
    // Check for subtitle
    await expect(page.getByRole('heading', { name: /Experience the perfect blend/i })).toBeVisible();
    
    // Check for start chatting button
    await expect(page.getByRole('button', { name: 'Start Chatting' })).toBeVisible();
  });

  test('can navigate to chat page via start button', async ({ page }) => {
    await page.goto('/');
    
    // Click the Start Chatting button
    await page.getByRole('button', { name: 'Start Chatting' }).click();
    
    // Verify we're on the chat page
    await expect(page).toHaveURL('/chat');
    await expect(page.getByRole('heading', { name: 'Start a New Chat' })).toBeVisible();
  });
});

test.describe('Chat Interface', () => {
  test('chat interface loads correctly', async ({ page }) => {
    await page.goto('/chat');
    
    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Check that chat interface elements are present
    await expect(page.getByRole('heading', { name: 'Start a New Chat' })).toBeVisible();
    await expect(page.getByText('Type your first message below to begin')).toBeVisible();
    
    // Check for message input
    await expect(page.getByRole('textbox', { name: 'Type your message here...' })).toBeVisible();
    
    // Check for send button (initially disabled)
    const sendButton = page.getByRole('button', { name: 'send message' });
    await expect(sendButton).toBeVisible();
    await expect(sendButton).toBeDisabled();
  });

  test('send button enables when message is typed', async ({ page }) => {
    await page.goto('/chat');
    
    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    const messageInput = page.getByRole('textbox', { name: 'Type your message here...' });
    const sendButton = page.getByRole('button', { name: 'send message' });
    
    // Initially disabled
    await expect(sendButton).toBeDisabled();
    
    // Type a message
    await messageInput.fill('Hello, this is a test message!');
    
    // Should now be enabled
    await expect(sendButton).toBeEnabled();
    
    // Clear message
    await messageInput.clear();
    
    // Should be disabled again
    await expect(sendButton).toBeDisabled();
  });
});

test.describe('Settings Page', () => {
  test('settings page loads', async ({ page }) => {
    await page.goto('/settings');
    
    // Check that the page loads (may have loading state initially)
    await expect(page).toHaveTitle('Tea 4 Chat');
    
    // Wait for content to load (settings page may be async)
    // This is a basic test - can be expanded once we see what loads
    await expect(page).toHaveURL('/settings');
  });
});