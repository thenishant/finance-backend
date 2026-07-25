/**
 * @openapi
 * /transactions:
 *   get:
 *     summary: Get all transactions
 *     tags:
 *       - Transactions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of transactions
 *
 *   post:
 *     summary: Create transaction
 *     tags:
 *       - Transactions
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateTransactionRequest'
 *     responses:
 *       201:
 *         description: Transaction created
 */
export {};