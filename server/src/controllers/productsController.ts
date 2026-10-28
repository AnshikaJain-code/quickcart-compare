import type { RequestHandler } from 'express';
import { listProducts } from '../services/productService';
import { productsQuery } from '../validators/products';

export const getProducts: RequestHandler = async (req, res) => {
  res.json(await listProducts(productsQuery.parse(req.query)));
};
