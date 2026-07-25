/**
 * @openapi
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *
 *   schemas:
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *
 *     Category:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         type:
 *           type: string
 *
 *     FinancialAccount:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         balance:
 *           type: string
 *
 *     Transaction:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         type:
 *           type: string
 *         amount:
 *           type: string
 *         date:
 *           type: string
 *         merchant:
 *           type: string
 *           nullable: true
 *         note:
 *           type: string
 *           nullable: true
 */
export {};