import { AbstractEntity } from "../abstract/AbstractEntity";
import { IHistory } from "../interfaces/IHistory";
import { INFT } from "../interfaces/INFT";
import { INFTCollection } from "../interfaces/INFTCollection";
import { IPerson } from "../interfaces/IPerson";
import { IResponse } from "../interfaces/IResponse";
import { IQueryFilters } from "../interfaces/Query";
import { respond } from "../util/respond";

/**
 * This is the NFT controller class.
 * Do all the NFT's functions such as
 * get item detail, history, create and transfer.
 *
 * @param {INFT} data INFT data
 *
 * @property {data}
 * @property {table}
 * @property {personTable}
 * @property {historyTable}
 * @property {nftCollectionTable}
 * 
 * @method getItemDetail
 * @method getItemHistory
 * @method getItems
 * @method createNFT
 * @method transferNFT
 * @method findNFTItem
 * @method findCollection
 * @method findPerson
 *
 * @author Tadashi <tadashi@depo.io>
 * @version 0.0.1
 *
 * ----
 * Example Usage
 *
 * const ctl = new NFTController();
 *
 * await ctl.getItemDetail('0xbb6a549b1cf4b2d033df831f72df8d7af4412a82', 3)
 *
 */
export class NFTController extends AbstractEntity {
  protected data: INFT;
  protected table: string = "NFT";
  private personTable: string = "Person";
  private historyTable: string = "History";
  private nftCollectionTable: string = "NFTCollection";

  /**
   * Constructor of class
   * @param nft NFT item data
   */
  constructor(nft?: INFT) {
    super();
    this.data = nft;
  }

  /**
   * Get NFT item detail information
   * 
   * @param collection Collection Contract Address
   * @param nftId NFT item index
   * @returns INFT object including NFT item information
   */
  async getItemDetail(collection: string, nftId: string): Promise<INFT | IResponse> {
    try {
      if (this.mongodb) {
        const query = this.findNFTItem(collection, nftId);
        const result = await this.findOne(query);

        if (result) {
          return result;
        }
        return respond("nft not found.", true, 422);
      } else {
        throw new Error("Could not connect to the database.");
      }
    } catch (error) {
      console.log(`NFTController::getItemDetail::${this.table}`, error);
      return respond(error.message, true, 500);
    }
  }

  /**
   * Get NFT item history
   * @param collection Collection Contract Address
   * @param nftId NFT item index in collection
   * @returns Array<IHistory>
   */
  async getItemHistory(collection: string, nftId: string): Promise<Array<IHistory> | IResponse> {
    try {
      if (this.mongodb) {
        const query = this.findNFTItem(collection, nftId);
        const result = await this.findOne(query) as INFT;

        if (result) {
          return result.history;
        }
        return respond("nft not found.", true, 422);
      } else {
        throw new Error("Could not connect to the database.");
      }
    } catch (error) {
      console.log(`NFTController::getItemDetail::${this.table}`, error);
      return respond(error.message, true, 500);
    }
  }

  /**
   * Get all NFTs in collection
   * @param contract Collection Contract Address
   * @param filters filter
   * @returns Array<INFT>
   */
  async getItems(contract: string, filters?: IQueryFilters): Promise<Array<INFT> | IResponse> {
    try {
      if (this.mongodb) {
        const query = this.findCollection(contract);
        const result = await this.findAll(query);
        if (result) {
          return result;
        }
        return respond("collection not found.", true, 422);
      } else {
        throw new Error("Could not connect to the database.");
      }
    } catch (error) {
      console.log(`NFTController::getItems::${this.table}`, error);
      return respond(error.message, true, 500);
    }
  }

  /**
   * Create NFT item - save to NFT table in db
   * It check collection, owner and creator.
   * After that it create new INFT object and insert it to collection
   * Also it adds this nft to the owner's nft and creator's created
   * Then it adds nft item to the collection
   * 
   * @param contract 
   * @param nftId 
   * @param artURI 
   * @param price 
   * @param ownerAddr 
   * @param creatorAddr 
   * @returns 
   */
  async createNFT(contract: string, nftId: string, artURI: string, price: number, ownerAddr: string, creatorAddr: string): Promise<IResponse> {
    const nftTable = this.mongodb.collection(this.table);
    const collectionTable = this.mongodb.collection(this.nftCollectionTable);
    const ownerTable = this.mongodb.collection(this.personTable);

    const query = this.findNFTItem(contract, nftId);
    const findResult = await nftTable.findOne(query) as INFT;
    if (findResult && findResult._id) {
      return respond("Current nft has been created already", true, 501);
    }
    
    const collection = await collectionTable.findOne(this.findCollection(contract)) as IPerson;
    if (!collection) {
      return respond("collection not found.", true, 422);
    }

    const owner = await ownerTable.findOne(this.findPerson(ownerAddr)) as IPerson;
    if (!owner) {
      return respond("owner not found.", true, 422);
    }

    const creator = await ownerTable.findOne(this.findPerson(creatorAddr)) as IPerson;
    if (!creator) {
      return respond("creator not found.", true, 422);
    }

    const nft : INFT = {
      collection: contract,
      index: nftId,
      owner: owner,
      creator: creator,
      artURI: artURI,
      price: price,
      like: 0,
      priceHistory: [],
      history: [],
      status: "created"
    }

    collection.nfts.push(nft);
    collectionTable.updateOne({_id: collection._id}, collection);

    owner.nfts.push(nft);
    ownerTable.updateOne({_id: owner._id}, owner);

    creator.created.push(nft);
    ownerTable.updateOne({_id: nft._id}, creator);

    const result = await nftTable.insertOne(nft);
    return (result
            ? respond('Successfully created a new nft with id ${result.insertedId}', true, 201)
            : respond("Failed to create a new nft.", true, 501)); 
  }

  /**
   * Transfer NFT item from old owner to new owner
   * At first, it gets collection, old owner, new owner, nft
   * Create new history with data
   * Add created history to the collection, old owner, new owner's history
   * Remove nft from old owner's nfts list and add it to the new owner's nft list
   * Insert new history to the history table
   * 
   * @param contract Collection Contract Address
   * @param nftId NFT item index
   * @param from Old owner wallet address
   * @param to New owner wallet address
   * @param curDate transaction date
   * @param price sell price
   * @returns 
   */
  async transferNFT(contract: string, nftId: string, from: string, to: string, curDate: Date, price: number) : Promise<IResponse> {
    const collectionTable = this.mongodb.collection(this.nftCollectionTable);
    const nftTable = this.mongodb.collection(this.table);
    const ownerTable = this.mongodb.collection(this.personTable);
    const historyTable = this.mongodb.collection(this.historyTable);

    const collection = await collectionTable.findOne(this.findCollection(contract)) as INFTCollection;
    if (collection && collection._id) {
      return respond("collection not found", true, 501);
    }

    const query = this.findNFTItem(contract, nftId);
    const nft = await nftTable.findOne(query) as INFT;
    if (nft && nft._id) {
      return respond("Current nft has been created already", true, 501);
    }
    
    const fromOwner = await ownerTable.findOne(this.findPerson(from)) as IPerson;
    if (!fromOwner) {
      return respond("from owner not found.", true, 422);
    }

    const toOwner = await ownerTable.findOne(this.findPerson(to)) as IPerson;
    if (!toOwner) {
      return respond("to onwer not found.", true, 422);
    }

    const history :IHistory = {
      collection: contract,
      nftId: nftId,
      type: "transfer",
      price: price,
      from: fromOwner,
      to: toOwner,
      date: curDate,
    };

    collection.history.push(history);
    collectionTable.updateOne({_id:collection._id}, collection);

    const index = fromOwner.nfts.indexOf(nft, 0);
    if (index > -1) {
      fromOwner.nfts.splice(index, 1);
    }
    toOwner.nfts.push(nft);

    fromOwner.history.push(history);
    ownerTable.updateOne({_id: fromOwner._id}, fromOwner);
    toOwner.history.push(history);
    ownerTable.updateOne({_id: toOwner._id}, toOwner);

    const result = await historyTable.insertOne(history);
    return (result
            ? respond('Successfully created a new history with id ${result.insertedId}', true, 201)
            : respond("Failed to create a new history.", true, 501));
  }
  
  /**
   * Mounts a generic query to find an item by its collection contract and index.
   * @param contract
   * @returns
   */
   private findNFTItem(contract: string, nftId: string): Object {
    return {
      collection: contract,
      index: nftId
    };
  }

  /**
   * Mounts a generic query to find a collection by contract address.
   * @param contract
   * @returns
   */
   private findCollection(contract: string): Object {
    return {
      collection: contract,
    };
  }

  /**
   * Mounts a generic query to find a person by wallet address.
   * @param contract
   * @returns
   */
   private findPerson(address: string): Object {
    return {
      wallet: address,
    };
  }
}
