import { create, getAll, getOne, findOrCreateUser, update, removeApiKey } from './user'

/**
 * Exports the users actions routes.
 * @param {*} router 
 * @param {*} options 
 */
export const user = async (router: any, options: any) => {
  router.get('/', getAll);
  router.get('/:walletId', getOne);
  router.post('/auth', findOrCreateUser);
  router.post('/', create);
  router.put('/:walletId', update);
  router.delete('/:walletId/:exchangeId/:apiKey', removeApiKey);
}