import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from "swagger-ui-express";
import authRoutes from './modules/auth/auth.routes';
import errorHandler from './shared/middleware/errorHandler';
import transactionRoutes from "./modules/transactions/transaction.routes";
import categoriesRoutes from "./modules/categories/categories.routes";
import analyticsRoutes from "./modules/analytics/analytics.routes";
import investmentRoutes from "./modules/investments/investment.routes";
import gmailRoutes from "./modules/email/gmail/gmail.routes";
import financialAccountRoutes from "./modules/financial-account/financial-account.routes";
import {specs} from "./docs/swagger";


const app = express();

app.get('/', (_req, res) => {
    res.send('Server alive');
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/transactions', transactionRoutes);
app.use("/categories", categoriesRoutes);
app.use("/analytics", analyticsRoutes);
app.use("/investment", investmentRoutes);
app.use("/api/gmail", gmailRoutes);
app.use("/financial-accounts", financialAccountRoutes);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));
app.use(errorHandler);

export default app;