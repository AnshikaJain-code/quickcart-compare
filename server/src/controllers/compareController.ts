import type { RequestHandler } from 'express';
import { compare, type CompareDeps } from '../services/compareService';
import type { CompareRequest } from '../services/compareTypes';
import { getQuoteDetail } from '../services/quoteService';
import { compareBody } from '../validators/compare';
import { quoteParams } from '../validators/quotes';

export function postCompare(deps: CompareDeps): RequestHandler {
  return async (req, res) => {
    const body = compareBody.parse(req.body);
    const request: CompareRequest = {
      pinCode: body.pinCode,
      items: body.items.map((i) => ({
        productId: i.productId.toLowerCase(),
        quantity: i.quantity,
      })),
      sortBy: body.sortBy,
      mode: body.mode,
      allowSubstitutes: body.allowSubstitutes,
      weights: body.weights,
    };
    res.json(await compare(request, deps));
  };
}

export function getQuote(deps: CompareDeps): RequestHandler {
  return async (req, res) => {
    const { quoteId } = quoteParams.parse(req.params);
    res.json(await getQuoteDetail(quoteId.toLowerCase(), deps.now(), deps.staleAfterMinutes));
  };
}
