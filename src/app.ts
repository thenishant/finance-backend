import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import authRoutes from './modules/auth/auth.routes';
import errorHandler from './shared/middleware/errorHandler';
import accountRoutes from "./modules/accounts/account.routes";
import transactionRoutes from "./modules/transactions/transaction.routes";
import categoriesRoutes from "./modules/categories/categories.routes";
import analyticsRoutes from "./modules/analytics/analytics.routes";

dotenv.config();

const app = express();

app.get('/', (_req, res) => {
    res.send('Server alive');
});

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/accounts', accountRoutes);
app.use('/transactions', transactionRoutes);
app.use("/categories", categoriesRoutes);
app.use("/analytics", analyticsRoutes);

app.use(errorHandler);

export default app;