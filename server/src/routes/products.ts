import { Router } from 'express';
import { getProducts } from '../controllers/productsController';

export const productsRouter = Router();
productsRouter.get('/products', getProducts);
