/**
 * Frontend Type Definitions for Pappu API Contracts.
 * Conforms to Backend v2 schemas.
 */

/**
 * @typedef {'neutral' | 'happy' | 'excited' | 'concerned' | 'confused'} AssistantMood
 */

/**
 * @typedef {'neutral' | 'worried'} SummaryMood
 */

/**
 * @typedef {Object} DailyBucket
 * @property {string} date - ISO date string or year-month string
 * @property {string} label - Short day/month label (e.g. 'Mon', '15', 'Jan')
 * @property {number} amount - Total spent in bucket
 */

/**
 * @typedef {Object} ExpenseCategoryItem
 * @property {string} category - Category name
 * @property {number} amount - Total amount spent in category
 * @property {number} percentage - Percentage of total period spending
 */

/**
 * @typedef {Object} TopContactItem
 * @property {string} id - Contact UUID
 * @property {string} name - Contact display name
 * @property {number} net_balance - Net balance (positive: owes you, negative: you owe)
 * @property {'owes_you' | 'you_owe' | 'settled'} [status] - Balance relation status
 */

/**
 * @typedef {Object} PeopleCounts
 * @property {number} owed_to_you - Count of contacts who owe money to user
 * @property {number} you_owe - Count of contacts user owes money to
 * @property {number} settled - Count of settled contacts
 * @property {number} total - Total active contacts count
 */

/**
 * @typedef {Object} PeoplePeriodBlock
 * @property {number} total_owed_to_user - Total money owed to user
 * @property {number} total_user_owes - Total money user owes
 * @property {number} owed_to_you - Same as total_owed_to_user
 * @property {number} you_owe - Same as total_user_owes
 * @property {PeopleCounts} counts - People breakdown counts
 * @property {Array<TopContactItem>} top_contacts - Top 3 contacts by absolute net
 */

/**
 * @typedef {Object} SummaryResponse
 * @property {string} period - 'week' | 'month' | 'year' | 'all'
 * @property {string} period_start - IST period start date
 * @property {string} period_end - IST period end date
 * @property {number} total_spent - Total expenses excluding people
 * @property {number} total_income - Total income excluding people
 * @property {number} net - Net income minus expenses
 * @property {number} previous_period_spent - Total spent in previous period
 * @property {number|null} spent_delta_percentage - Delta pct vs previous period (null if prev < 500)
 * @property {number|null} delta_pct - Alias for spent_delta_percentage
 * @property {number} delta_abs - Absolute change in currency (total_spent minus prev_spent)
 * @property {number} avg_per_day - Average spending per day across the period
 * @property {DailyBucket|null} max_day - Peak spending day bucket in the period
 * @property {SummaryMood} mood - 'worried' when spend > 1.5x previous and > 500, else 'neutral'
 * @property {Array<DailyBucket>} daily_buckets - Zero-filled buckets for period
 * @property {Array<ExpenseCategoryItem>} categories - Category spending breakdown
 * @property {PeoplePeriodBlock} people - People balances and counts
 */

/**
 * @typedef {Object} PendingSummary
 * @property {string} id - Pending item UUID
 * @property {'confirm' | 'disambiguate' | 'contact_confirm' | 'future_date'} kind - Pending item kind
 * @property {string} question - Question to display and confirm
 * @property {Array<Object>|null} candidates - Candidate transactions or contacts
 * @property {string|null} expires_at - Expiry timestamp
 */

/**
 * @typedef {Object} AssistantResponse
 * @property {string} reply_text - Display text formatted for user bubble
 * @property {string} spoken_text - Concise spoken text for TTS
 * @property {string} language - Response language code ('en', 'ml', 'mixed')
 * @property {Array<Object>} results - Executed action results
 * @property {PendingSummary|null} pending - Active pending item awaiting confirmation or disambiguation
 * @property {boolean} changed - Whether financial state changed
 * @property {AssistantMood} mood - Pappu mascot mood derived from result kinds
 */

/**
 * @typedef {Object} ProfileResponse
 * @property {string} name - User display name
 * @property {string|null} email - User email from verified auth claims
 * @property {string|null} language - User preferred language
 * @property {boolean|null} voice_replies - Whether voice replies are enabled
 */

export {};
