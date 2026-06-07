import type { ExchangeInfo } from './types'

export const EXCHANGES: ExchangeInfo[] = [
  {
    id: 'binance',
    name: 'Binance',
    emoji: '🟡',
    color: '#F0B90B',
    description: "World's largest exchange",
  },
  {
    id: 'bybit',
    name: 'Bybit',
    emoji: '🟠',
    color: '#F7A600',
    description: 'Leading derivatives exchange',
  },
  {
    id: 'okx',
    name: 'OKX',
    emoji: '⚫',
    color: '#FFFFFF',
    description: 'Global crypto exchange',
    requiresPassphrase: true,
  },
  {
    id: 'kraken',
    name: 'Kraken',
    emoji: '🔵',
    color: '#5741D9',
    description: 'Trusted US exchange',
  },
  {
    id: 'kucoin',
    name: 'KuCoin',
    emoji: '🟢',
    color: '#24AE8F',
    description: "People's exchange",
    requiresPassphrase: true,
  },
]

export const EXCHANGE_API_GUIDES: Record<
  string,
  { steps: string[]; url: string; warnings: string[] }
> = {
  binance: {
    url: 'https://account.binance.com/en/my/settings/api-management',
    steps: [
      'Log in to your Binance account',
      'Go to Account → API Management',
      'Click "Create API" and select "System generated"',
      'Enter a label like "APEX Trading Bot"',
      'Complete security verification (2FA)',
      'Under API Restrictions, enable "Enable Reading" and "Enable Spot & Margin Trading"',
      'Do NOT enable "Enable Withdrawals"',
      'Add your IP or leave blank for any IP',
      'Copy both the API Key and Secret Key',
    ],
    warnings: [
      'Never share your API keys with anyone',
      'Do NOT enable withdrawal permissions',
      'Store your keys securely — Binance shows the secret only once',
    ],
  },
  bybit: {
    url: 'https://www.bybit.com/app/user/api-management',
    steps: [
      'Log in to your Bybit account',
      'Go to Account & Security → API Management',
      'Click "Create New Key"',
      'Select "System-generated API Keys"',
      'Set usage as "API Transaction"',
      'Enable "Read-Write" permission',
      'Under Contract: enable "Orders" and "Positions"',
      'Under Spot: enable "Trade"',
      'Complete 2FA verification',
      'Copy your API Key and API Secret',
    ],
    warnings: [
      'API Secret is shown only once — save it immediately',
      'Do not enable withdrawal permissions',
      'Consider IP restriction for added security',
    ],
  },
  okx: {
    url: 'https://www.okx.com/account/my-api',
    steps: [
      'Log in to your OKX account',
      'Go to Profile → API (or use the direct link above)',
      'Click "Create API Key"',
      'Set API name to "APEX Trading"',
      'Set Passphrase (you will need this — treat it like a password)',
      'Under Permissions, select "Read" and "Trade"',
      'Do NOT select "Withdraw"',
      'Complete verification',
      'Note: OKX requires API Key + Secret + Passphrase',
    ],
    warnings: [
      'OKX requires a passphrase in addition to key/secret',
      'Enter your passphrase in the dedicated Passphrase field',
      'Never enable withdrawal permissions',
    ],
  },
  kraken: {
    url: 'https://www.kraken.com/u/security/api',
    steps: [
      'Log in to your Kraken account',
      'Go to Settings → Security → API (or use the link above)',
      'Click "Add key"',
      'Give it a description like "APEX Bot"',
      'Under Key Permissions, enable: Query Funds, Query Open Orders & Trades, Create & Modify Orders',
      'Do NOT enable Withdraw Funds',
      'Set expiry to "No expiration" or a future date',
      'Click "Generate key"',
      'Copy both the API Key and Private Key',
    ],
    warnings: [
      'The private key is your "secret" — save it securely',
      'Never enable withdrawal permissions',
      'Kraken calls it "Private Key" but it is your API Secret',
    ],
  },
  kucoin: {
    url: 'https://www.kucoin.com/account/api',
    steps: [
      'Log in to your KuCoin account',
      'Click your avatar → API Management',
      'Click "Create API"',
      'Set API Name to "APEX Trading"',
      'Create a strong API Passphrase',
      'Under Permissions, select "General" and "Trade"',
      'Do NOT select "Transfer"',
      'Complete verification',
      'Save your API Key, API Secret, and Passphrase',
    ],
    warnings: [
      'KuCoin requires a passphrase in addition to key/secret',
      'Enter your passphrase in the dedicated Passphrase field',
      'The secret is shown only once at creation',
    ],
  },
}

export function getExchange(id: string): ExchangeInfo | undefined {
  return EXCHANGES.find((e) => e.id === id)
}
