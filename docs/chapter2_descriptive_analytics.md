# 2.3.3 Descriptive Analytics Module

The Descriptive Analytics Module of CORVEX transforms recorded collection, sales, inventory, customer payment and credit, and branch records into summarized information for analysis and decision support. The module retrieves validated records from the centralized PostgreSQL database, aggregates the records according to relevant dimensions such as branch, date, product, and customer, and calculates descriptive measures including totals, counts, percentages, comparisons, and trends. The calculated measures are visualized through numerical summaries, tables, charts, and trend visualizations and are subsequently interpreted to identify changes, differences, and conditions within the recorded data. Unlike the SAW model, which prioritizes customers for collection scheduling and route generation, the Descriptive Analytics Module analyzes recorded data to provide management with evidence for evaluating sales, collection, inventory, customer payment and credit, and branch performance.

---

## 2.3.3.1 Data Aggregation

Before generating descriptive measures, CORVEX retrieves validated records from the centralized PostgreSQL database. The records include collection transactions, sales transactions, inventory movements, customer payment records, customer credit information, and branch records. The system groups these records according to the dimension required by each analytical measure, such as branch, transaction date, product, or customer. The aggregated records serve as the source data from which the descriptive measures are calculated.

**Table 13. Data Sources for Descriptive Analytics**

| Data Source | Records Retrieved | Grouping Dimension |
|---|---|---|
| Collection transactions | Receipt number, collector, customer, amount, date, branch | Branch, date, collector |
| Sales transactions | Invoice number, agent, customer, product, amount, date, branch | Branch, date, agent, product |
| Inventory movements | Product, stock-in, stock-out, transfer, adjustment, branch | Branch, product |
| Customer payment records | Customer, outstanding balance, payment date, status | Branch, customer, status |
| Customer credit information | Customer, credit limit, credit score, employment status | Branch, customer |
| Branch records | Branch name, location, associated staff and customers | Branch |

Table 13 presents the records retrieved from the centralized database for descriptive analytics. These records are grouped according to the required analytical dimensions and serve as the source data for calculating the descriptive measures presented in the succeeding subsection.

---

## 2.3.3.2 Descriptive Measure Generation

After the records are aggregated, CORVEX calculates descriptive measures from the consolidated data to summarize collection, sales, inventory, customer payment and credit, and branch conditions. The calculations are based on the corresponding values stored in the transaction and master records. Total amounts are obtained by summing transaction values, transaction activity is determined by counting records, percentages are calculated from their corresponding totals, and trends are determined by comparing the calculated measures across reporting periods. These calculated measures provide the numerical results that are subsequently visualized and interpreted for decision support.

---

### 2.3.3.2.1 Collection Analysis

Collection records are summarized to determine total collections and changes in collection activity across reporting periods and branches. Total Collection is calculated by summing the recorded collection amounts within the selected reporting period.

**Equation 5. Total Collection**

$$TC = \sum_{i=1}^{n} C_i$$

Where:
- $TC$ = Total Collection
- $C_i$ = individual collection amount
- $n$ = number of collection transactions

**Sample computation**

Sample collections: ₱10,000 + ₱15,000 + ₱12,000

$$TC = 10{,}000 + 15{,}000 + 12{,}000$$

$$TC = \text{₱37,000}$$

The resulting ₱37,000 represents the total collections recorded within the sample period. When compared against a target or a previous period's total, the measure provides management with evidence of whether collection activity is meeting expected levels.

---

### 2.3.3.2.2 Sales Analysis

Sales records are summarized to determine total sales and changes in sales activity across reporting periods and branches. Total Sales is calculated by summing the recorded sales amounts within the selected reporting period. The resulting total is then compared with the corresponding value from a previous reporting period to determine whether recorded sales activity increased or decreased.

**Equation 6. Total Sales**

$$TS = \sum_{i=1}^{n} S_i$$

Where:
- $TS$ = Total Sales
- $S_i$ = individual sales amount
- $n$ = number of sales transactions

**Sample computation**

Sample sales: ₱100,000 + ₱150,000 + ₱125,000

$$TS = 100{,}000 + 150{,}000 + 125{,}000$$

$$TS = \text{₱375,000}$$

**Equation 7. Sales Growth Rate**

$$SGR = \frac{S_c - S_p}{S_p} \times 100$$

Where:
- $SGR$ = Sales Growth Rate (%)
- $S_c$ = current-period sales
- $S_p$ = previous-period sales

**Sample computation**

Current period = ₱375,000 | Previous period = ₱300,000

$$SGR = \frac{375{,}000 - 300{,}000}{300{,}000} \times 100$$

$$SGR = 25\%$$

The calculated 25% increase indicates that recorded sales activity increased during the current period compared with the previous period. When this positive change is observed across successive reporting periods, it indicates an upward sales trend and provides management with evidence for reviewing current sales activities and planning succeeding sales activities.

---

### 2.3.3.2.3 Inventory Analysis

Inventory records are summarized to determine available stock and inventory movement by product and branch. The system calculates the current available quantity using recorded stock-in, stock-out, transfer, and adjustment transactions according to the inventory rules implemented in CORVEX. The resulting values are compared across branches to identify differences in product availability and stock movement.

**Equation 8. Available Stock**

$$AS = SI - SO + TI - TO + A$$

Where:
- $AS$ = Available Stock
- $SI$ = Stock-In
- $SO$ = Stock-Out
- $TI$ = Transfer-In
- $TO$ = Transfer-Out
- $A$ = Adjustment (positive for additions, negative for write-offs)

**Sample computation**

$$AS = 500 - 120 + 50 - 20 + (-10)$$

$$AS = 400 \text{ units}$$

The resulting 400 units represent the available stock based on the recorded inventory transactions. When available stock is compared across branches, differences in inventory availability can be identified, allowing authorized personnel to review branches with relatively lower stock levels and coordinate inventory requirements when necessary.

---

### 2.3.3.2.4 Customer Payment and Credit Analysis

Customer payment and credit records are summarized to determine outstanding customer balances, payment status, delinquent accounts, and credit exposure. Total Outstanding Balance is calculated by aggregating the remaining unpaid balances recorded for customers, while delinquent accounts are identified from records with overdue payment obligations. The resulting measures provide authorized personnel with a summarized view of customer payment and credit conditions across branches.

**Equation 9. Total Outstanding Balance**

$$TOB = \sum_{i=1}^{n} OB_i$$

Where:
- $TOB$ = Total Outstanding Balance
- $OB_i$ = outstanding balance of customer $i$
- $n$ = number of customers

**Sample computation**

$$TOB = 20{,}000 + 15{,}000 + 8{,}000$$

$$TOB = \text{₱43,000}$$

The resulting ₱43,000 represents the total outstanding balance within the sample customer records. Comparing this measure across branches allows authorized management personnel to identify where customer payment obligations are more concentrated and determine whether further payment or credit review is necessary.

---

### 2.3.3.2.5 Branch-Level Descriptive Comparison

CORVEX groups the calculated descriptive measures by branch to compare collection, sales, inventory, and customer payment and credit conditions among the Davao City, General Santos City, and Davao Oriental branches. The same measures generated from the underlying records are presented side by side to identify differences among branches and changes across reporting periods.

**Table 14. Sample Branch Descriptive Summary**

| Branch | Total Collection | Total Sales | Available Inventory | Outstanding Balance |
|---|---|---|---|---|
| Davao City | ₱500,000 | ₱750,000 | 1,250 units | ₱180,000 |
| General Santos | ₱620,000 | ₱900,000 | 1,840 units | ₱140,000 |
| Davao Oriental | ₱250,000 | ₱420,000 | 720 units | ₱210,000 |

*Note: Values in Table 14 are sample data used for illustration.*

Table 14 presents the descriptive measures grouped by branch. The comparison shows differences in recorded collection, sales, inventory availability, and outstanding customer balances among the three branches, providing management with a basis for identifying branch-level differences that may require further review.

---

## 2.3.3.3 Analytical Visualization

The descriptive measures generated from the aggregated records are presented through the Executive Dashboard using key performance indicators, comparative charts, tables, and trend visualizations. Collection and sales measures are displayed through numerical totals, branch comparisons, and period trends, while inventory and customer payment and credit measures are presented through summarized availability, balance, and status indicators. The dashboard functions as the visualization layer of the descriptive analytics process, presenting the calculated measures in a form that allows authorized personnel to examine differences and changes across branches and reporting periods.

*Figure 4. Executive Dashboard Showing Descriptive Analytics*

---

## Dashboard Metric Reference

The following table documents every metric displayed on the Executive Dashboard, including its data source, calculation, and interpretation. This is provided to ensure each value shown on the dashboard is traceable to the underlying database and calculation logic.

| Metric | Database Source | Calculation | Interpretation |
|---|---|---|---|
| Total Collections | `collection_payment` table | `SUM(amount)` for the selected period | Total peso value of all completed collections recorded within the period |
| Total Sales | `sales_invoices` table | `SUM(total_amount)` for the selected period | Total peso value of all confirmed sales invoices recorded within the period |
| Collection Trend | `collection_payment` table | `SUM(amount)` grouped by date/week/month | Increase or decrease in collection activity over time |
| Outstanding Balance | `customer_activity` table | `SUM(outstanding_balance)` per branch | Total unpaid customer balances at the branch level |
| Active Collectors | `users` table, role = `collector` | `COUNT(*)` where `status = 'Active'` and `branch_id` matches | Number of active collectors assigned to the branch |
| Active Sales Agents | `users` table, role = `sales_staff` | `COUNT(*)` where `status = 'Active'` and `branch_id` matches | Number of active sales agents assigned to the branch |
| Total Customers | `customers` table | `COUNT(*)` filtered by `branch_id` | Total number of customers registered under the branch |
| Route Compliance | `field_visits` table | `(Completed visits / Total assigned visits) × 100` | Percentage of scheduled field visits completed by collectors |
| Sales Visit Completion | `field_visits` table | `(Completed sales visits / Total assigned) × 100` | Percentage of scheduled sales visits completed by sales agents |
| Inventory Health | `branch_inventory` table | `100 - (stockout_count × 10)`, capped at 0–100 | Relative indicator of branch stock condition based on out-of-stock products |
| Stock Alerts | `branch_inventory` table | `COUNT(*)` where `available_stock <= reorder_level` | Number of products at or below their reorder threshold |
| Overdue Accounts | `customer_activity` table | `COUNT(*)` where `outstanding_balance > 0` | Number of customers with unpaid balances at the branch |
