import { test, expect } from '@playwright/test';

test.describe('Homepage and Navigation', () => {
  test('homepage loads correctly', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Check that the page loads with correct title
    await expect(page).toHaveTitle('Tea 4 Chat');
    
    // Check for main heading
    await expect(page.getByRole('heading', { name: 'Tea 4 Chat' })).toBeVisible();
    
    // Check for the chat form input
    await expect(page.getByRole('textbox')).toBeVisible();
    
    // Check for navigation menu button (from CommonLayout)
    await expect(page.getByRole('button', { name: 'menu' })).toBeVisible();
  });

  test('can create new chat by submitting message', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the page to be fully loaded
    await page.waitForLoadState('networkidle');
    
    // Type a message in the textbox
    const textbox = page.getByRole('textbox');
    await textbox.fill('Hello, test message');
    
    // Submit the form (usually by pressing Enter or clicking submit button)
    await textbox.press('Enter');
    
    // Wait for navigation to complete and verify we're on a chat page
    await expect(page).toHaveURL(/\/chat\/[a-z0-9-]+$/);
    
    // The page should show the chat interface
    await expect(page.getByRole('textbox', { name: 'Type your message here...' })).toBeVisible();
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