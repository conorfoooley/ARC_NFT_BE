import { IQueryFilters } from "../interfaces/Query";
import { IUser } from "../interfaces/IUser";
import { respond } from "../util/respond";
import { IResponse } from "../interfaces/IResponse";
import { AbstractEntity } from "../abstract/AbstractEntity";
import { IPerson } from "../interfaces/IPerson";
import { INFT } from "../interfaces/INFT";
import { ActivityType, IActivity } from "../interfaces/IActivity";
import { INFTCollection } from "../interfaces/INFTCollection";
import { S3uploadImageBase64 } from "../util/aws-s3-helper";
import { ObjectId } from "mongodb";
import { NFTCollectionController } from "./NFTCollectionController";
import { NFTController } from "./NFTController";
export class NFTOwnerController extends AbstractEntity {
  protected data: IPerson;
  protected table = "Person" as string;
  protected nftTable = "NFT" as string;
  protected historyTable = "Activity" as string;
  protected collectionTable = "NFTCollection" as string;
  constructor(user?: IPerson) {
    super();
    this.data = user;
  }
  /**
   * Gets a set of rows from the database
   * @param {IQueryFilters} filters
   */
  async findAllOwners(filters?: IQueryFilters): Promise<Array<IPerson> | IResponse> {
    try {
      if (this.mongodb) {
        const owner = this.mongodb.collection(this.table);
        const nftTable = this.mongodb.collection(this.nftTable);
        const collection = this.mongodb.collection(this.collectionTable);
        let aggregation = {} as any;
        if (filters) {
          aggregation = this.parseFilters(filters);
        }
        const result = (await owner.aggregate(aggregation).toArray()) as Array<IPerson>;
        let photo = "";
        if (result) {
          const items = await Promise.all(
            result.map(async (item) => {
              const ntfs = await nftTable.find({ owner: item.wallet }).count();
              const colls = await collection.find({ creator: item.wallet }).count();
              // if (item.photoUrl){
              //   photo=await S3GetSignedUrl(item.photoUrl);
              // }
              return {
                _id: item._id,
                photoUrl: item.photoUrl,
                wallet: item.wallet,
                username: item.username,
                bio: item.bio,
                social: item.social,
                nfts: ntfs,
                collections: colls,
              };
            })
          );
          return respond(items);
        }
      } else {
        throw new Error("Could not connect to the database.");
      }
    } catch (error) {
      return respond(error.message, true, 500);
    }
  }
  /**
   * Finds the user which has the given wallet id.
   *
   * @param walletId eth user's main wallet id
   * @returns `IPerson`
   */
  async findPerson(personId: string): Promise<IPerson | IResponse> {
    const query = this.findUserQuery(personId);
    const personTable = this.mongodb.collection(this.table);
    // const result = await this.findOne(query);
    const result = await personTable.findOne(query);
    const nftTable = this.mongodb.collection(this.nftTable);
    const collection = this.mongodb.collection(this.collectionTable);
    const ntfs = await nftTable.find({ owner: personId },{projection:{_id:1}}) .count();
    const colls = await collection.find({ creator: personId },{projection:{_id:1}}).count();

    if (result) {
      return respond({
        ...result,
        nfts: ntfs,
        collections: colls,
      });
    } else {
      await personTable.insertOne({
        wallet: personId,
        photoUrl: "",
        social: "",
        bio: "",
        username: "",
        nonce:0
      });
      const result = await personTable.findOne(query);
      return respond({
        ...result,
        nfts: 0,
        collections: 0,
      });
    }
  }
  /**
   *
   * @param backgroundUrl
   * @param photoUrl
   * @param wallet
   * @param joinedDate
   * @param displayName
   * @param username
   * @returns new owner created
   */
  async createOwner(
    photoUrl: string,
    wallet: string,
    bio: string,
    username: string,
    social: string,
    email: string,
    optIn: boolean,
  ): Promise<IPerson | IResponse> {
    const collection = this.mongodb.collection(this.table);
    const findOwner = (await collection.findOne(this.findUserQuery(wallet))) as IPerson;
    if (findOwner && findOwner._id) {
      return respond("Current user has been created", true, 501);
    }
    if (username){
      const findUser=await collection.findOne({username:{'$regex' : username, '$options' : 'i'} ,wallet:{$ne:wallet}}) as IPerson;
      if (findUser && findUser._id) {
        return respond("Username or Nickname already exists", true, 501);
      }
    }
    if (email ){
      const findUser=await collection.findOne({email:{'$regex' : email, '$options' : 'i'} ,wallet:{$ne:wallet}}) as IPerson;
      console.log(findUser);
      if (findUser && findUser._id) {
        return respond("Email already exists", true, 501);
      }
    }
    const person: IPerson = {
      photoUrl,
      wallet:wallet,
      social,
      bio,
      username: username,
      email:email,
      optIn:optIn,
      nonce:0, //set 0 as default value
      // nfts: [],
      // collections: []
      // created: [],
      // favourites: [],
      // history: [],
    };
    const result = await collection.insertOne(person);
    return result
      ? respond(`Successfully created a new owner with id ${result.insertedId}`, false, 201)
      : respond("Failed to create a new owner.", true, 501);
  }
  /**
   *
   * @param personId @param
   * @param bodyData IPerson
   * @returns
   */
  async updateOwner(wallet: string, bodyData: any): Promise<IPerson | IResponse> {
    try {
      if (this.mongodb) {
        const person = this.mongodb.collection(this.table);
        if (bodyData && bodyData.username){
          const findUser=await person.findOne({username:{'$regex' : bodyData.username, '$options' : 'i'} ,wallet:{$ne:wallet}}) as IPerson;
          console.log(findUser);
          if (findUser && findUser._id) {
            return respond("Username or Nickname already exists", true, 501);
          }
        }
        if (bodyData && bodyData.email){
          const findUser=await person.findOne({email:{'$regex' : bodyData.email, '$options' : 'i'} ,wallet:{$ne:wallet}}) as IPerson;
          console.log(findUser);
          if (findUser && findUser._id) {
            return respond("Email already exists", true, 501);
          }
        }
        await person.updateOne({ wallet }, { $set: { ...bodyData } });
        const findOwner = (await person.findOne(this.findUserQuery(wallet))) as IPerson;
        return respond(findOwner);
      } else {
        throw new Error("Could not connect to the database.");
      }
    } catch (error) {
      return respond(error.message, true, 500);
    }
  }
  async updateOwnerPhoto(mimeType: string, wallet: string, body: any): Promise<IPerson | IResponse> {
    try {
      console.log(mimeType);
      if (this.mongodb) {
        const person = this.mongodb.collection(this.table);
        const findOwner = (await person.findOne(this.findUserQuery(wallet))) as IPerson;
        if (!findOwner) {
          return respond("Current user not exists", true, 422);
        }
        
        const img = await S3uploadImageBase64(body, `${wallet}_${Date.now()}`,mimeType,'profile');
        const result = await person.updateOne({ wallet }, { $set: { photoUrl: img['location'] } });
        if (result) {
          return this.findPerson(wallet);
        }
        return respond("owner not found.", true, 422);
      } else {
        throw new Error("Could not connect to the database.");
      }
    } catch (error) {
      return respond(error.message, true, 500);
    }
  }
  /**
   *
   * @param ownerId  eq WalletId
   * @param filters IQueryFilters
   *  OrderBy , direction, filters :[{fieldName:@field,query:@value}]
   *
   * @returns INFT
   */
  async getOwnerNtfs(ownerId: string, filters?: IQueryFilters): Promise<Array<INFT> | IResponse> {
    try {
      if (this.mongodb) {
        const nftTable = this.mongodb.collection(this.nftTable);
        let aggregation = {} as any;
        aggregation = this.parseFiltersFind(filters);
        const query = this.findOwnerNtfs(ownerId);
        let result;
        let count;
        if (!this.checkLimitRequest(aggregation.limit)){
          return respond('Max request limit = 1000',true,401)
        }
        if (aggregation && aggregation.filter) {
          count = await nftTable.find({...query,  $or: aggregation.filter },{projection:{_id:1}}).count();

          result = aggregation.sort
            ? ((await nftTable
                .find({...query,  $or: aggregation.filter })
                .sort(aggregation.sort)
                .skip(aggregation.skip)
                .limit(aggregation.limit)
                .toArray()) as Array<INFT>)
            : ((await nftTable
                .find({ ...query, $or: aggregation.filter })
                .skip(aggregation.skip)
                .limit(aggregation.limit)
                .toArray()) as Array<INFT>);
        } else {
          count = await nftTable.find({...query, },{projection:{_id:1}}).count();
          result = aggregation.sort
            ? await nftTable.find({...query, }).sort(aggregation.sort).skip(aggregation.skip).limit(aggregation.limit).toArray()
            : ((await nftTable.find({...query, }).skip(aggregation.skip).limit(aggregation.limit).toArray()) as Array<INFT>);
        }
        if (result) {
          const ctl= new NFTController();
          const rs = await ctl.resultItem(result,ownerId);
          
          let rst = {
             success: true,
            status: "ok",
            code: 200,
            count: count,
            currentPage: aggregation.page,
            data: rs,
          }
          return rst;
        }
        return respond("Items not found.", true, 422);
      } else {
        throw new Error("Could not connect to the database.");
      }
    } catch (error) {
      return respond(error.message, true, 500);
    }
  }
  /**
   *
   * @param ownerId eq walletId
   * @param filters IQueryFilters
   * @returns IHistory
   */
  async getOwnerHistory(ownerId: string, filters?: IQueryFilters): Promise<Array<IActivity> | IResponse> {
    try {
      if (this.mongodb) {
        const activity = this.mongodb.collection(this.historyTable);
        const nftTable = this.mongodb.collection(this.nftTable);
        const collection = this.mongodb.collection(this.collectionTable);
        let aggregation = {} as any;
        
        aggregation = this.parseFiltersFind(filters);
        let result = [] as any;
        let count;
        if (!this.checkLimitRequest(aggregation.limit)){
          return respond('Max request limit = 1000',true,401)
        }

        if (!aggregation.sort){
            aggregation.sort={startDate:-1}
        };
        
        const query = this.findOwnerHistory(ownerId);
        if (aggregation && aggregation.filter) {
          count = await activity.find({ ...query, $or: aggregation.filter },{projection:{_id:1}}).count();
          result = aggregation.sort
            ? ((await activity
                .find({...query, $or: aggregation.filter })
                .sort(aggregation.sort)
                
                .limit(aggregation.limit)
                .toArray()) as Array<IActivity>)
            : ((await activity
                .find({...query, $or: aggregation.filter })
                
                .limit(aggregation.limit)
                .toArray()) as Array<IActivity>);
        } else {
          count = await activity.find({},{projection:{_id:1}}).count();
          result = aggregation.sort
            ? await activity
                .find({...query})
                .sort(aggregation.sort)
                
                .limit(aggregation.limit)
                .toArray()
            : ((await activity
                .find({...query})
                .sort(aggregation.sort)
                .limit(aggregation.limit)
                .toArray()) as Array<INFT>);
        }

        // result = (await activity.find(query).toArray()) as Array<INFT>;
        const colCtrl= new NFTCollectionController();
        if (result) {
          const resActivities = await Promise.all(
            result.map(async (item) => {
              const nfts = (await nftTable.findOne({ index: item.nftId })) as INFT;
              let coll = (await collection.findOne({ _id: new ObjectId(item.collection) }));
              // console.log('-->>>.f',f);
              if (coll){
                  const f = await colCtrl.getFloorPrice(`${item.collection}`);
                  const { _24h, todayTrade } = await colCtrl.get24HValues(item.collection);
                  coll.floorPrice=f?f:0;
                  coll._24h = todayTrade;
                  coll._24hPercent = _24h;
              }
              return {
                ...item,
                nft: { artURI: nfts?.artURI, name: nfts?.name,contentType:nfts?.contentType },
                collection: { ...coll },
              };
            })
          );
          return respond(resActivities);
        }
        return respond("Activities not found.", true, 422);
      } else {
        throw new Error("Could not connect to the database.");
      }
    } catch (error) {
      console.log(error)
      return respond(error.message, true, 422);
    }
  }
  /**
   *
   * @param ownerId eq walletId
   * @param filters
   * @returns INFTCollection
   */
  async getOwnerCollection(ownerId: string, filters?: IQueryFilters): Promise<Array<INFTCollection> | IResponse> {
    try {
      if (this.mongodb) {
        const collection = this.mongodb.collection(this.collectionTable);
        const nftTable = this.mongodb.collection(this.nftTable);
        const person = this.mongodb.collection(this.table);
        const activityTable = this.mongodb.collection(this.historyTable);
        let aggregation = {} as any;
        aggregation = this.parseFiltersFind(filters);
        let result = [] as any;
        let count;
        const query = this.findOwnerCollection(ownerId);
        if (!this.checkLimitRequest(aggregation.limit)){
          return respond('Max request limit = 1000',true,401)
        }
        if (aggregation && aggregation.filter) {
          count = await collection.find({...query, $or: aggregation.filter },{projection:{_id:1}}).count();
          result = aggregation.sort
            ? ((await collection
                .find({...query, $or: aggregation.filter })
                .sort(aggregation.sort)
                .skip(aggregation.skip)
                .limit(aggregation.limit)
                .toArray()) as Array<INFTCollection>)
            : ((await collection
                .find({ ...query,$or: aggregation.filter })
                .skip(aggregation.skip)
                .limit(aggregation.limit)
                .toArray()) as Array<INFTCollection>);
        }else{
          count = await collection.find({...query},{projection:{_id:1}}).count();
          result = aggregation.sort
            ? await collection.find({...query}).sort(aggregation.sort).skip(aggregation.skip).limit(aggregation.limit).toArray() as Array<INFTCollection>
            : ((await collection.find({...query}).skip(aggregation.skip).limit(aggregation.limit).toArray()) as Array<INFTCollection>);
        }
        
        const colCtrl = new NFTCollectionController();
        if (result) {
          const collections = await Promise.all(
            result.map(async (collection) => {
              let volume = 0;
              let floorPrice = 0;
              let owners = [];
              const count = await colCtrl.countItemAndOwner(collection._id);
              const personInfo = (await person.findOne({ wallet: collection.creator })) as IPerson;
              const { _24h, todayTrade } = await colCtrl.get24HValues(collection._id);
              floorPrice = await colCtrl.getFloorPrice(`${collection._id}`);
              return {
                ...collection,
                volume: volume,
                _24h: _24h,
                floorPrice: floorPrice,
                owners: count.owner,
                items: count.nfts,
                creatorDetail: { ...personInfo },
              };
            })
          );

          let rst = {
            success: true,
            status: "ok",
            code: 200,
            count: count,
            currentPage: aggregation.page,
            data: result,
          };

          return rst;
        }
        return respond("collection not found.", true, 422);
      } else {
        throw new Error("Could not connect to the database.");
      }
    } catch (error) {
      return respond(error.message, true, 500);
    }
  }
  /**
   *
   * @param ownerId
   *
   * @param contract
   * @param nftId
   * @returns
   */
  async getOwnerOffers(ownerId: string, filters?: IQueryFilters): Promise<Array<IActivity> | IResponse> {
    try {
      if (this.mongodb) {
        const activity = this.mongodb.collection(this.historyTable);
        const nftTable = this.mongodb.collection(this.nftTable);
        const collection = this.mongodb.collection(this.collectionTable);
        let aggregation = {} as any;
        aggregation = this.parseFiltersFind(filters);
        
        if (!this.checkLimitRequest(aggregation.limit)){
          return respond('Max request limit = 1000',true,401)
        }

        if (!aggregation.sort){
          aggregation.sort={startDate:-1}
      };
      let count;
      let result;
      let qry={
        
          active: true,
          $and: [
            { $or: [{ from: { $regex: new RegExp(ownerId, "igm") } }, { to: { $regex: new RegExp(ownerId, "igm") } }] },
            { $or: [{ type: ActivityType.LIST },{ type: ActivityType.OFFER },{ type: ActivityType.OFFERCOLLECTION }] },
          ]
      };
      if (aggregation && aggregation.filter) {
        count = await activity.find({ ...qry, $or: aggregation.filter },{projection:{_id:1}}).count();
        result = aggregation.sort
          ? ((await activity
              .find({...qry, $or: aggregation.filter })
              .sort(aggregation.sort)
              
              .limit(aggregation.limit)
              .toArray()) as Array<IActivity>)
          : ((await activity
              .find({...qry, $or: aggregation.filter })
              
              .limit(aggregation.limit)
              .toArray()) as Array<IActivity>);
      } else {
        count = await activity.find({...qry},{projection:{_id:1}}).count();
        result = aggregation.sort
          ? await activity
              .find({...qry})
              .sort(aggregation.sort)
              .limit(aggregation.limit)
              .toArray()
          : ((await activity
              .find({...qry})
              .sort(aggregation.sort)
              .limit(aggregation.limit)
              .toArray()) as Array<INFT>);
      }

        let rst = [];
        if (result) {
          const resActivities = await Promise.all(
            result.map(async (item) => {
              if (item && item.nftId){
                const nfts = (await nftTable.findOne({ collection: item.collection, index: item.nftId })) as INFT;
                const col = await collection.findOne({ _id: new ObjectId(item.collection) }) as INFTCollection;
                item.collectionId = item.collection;
                item.collection = col && col.contract?col.contract:null;
                item.collectionDetail={
                  creator:col.creator,
                  creatorEarning:col.creatorEarning
                }
                item.nft = { artURI: nfts?.artURI, name: nfts?.name,contentType:nfts?.contentType },
                rst.push(item)
              }
              return item;
            })
          );
          return respond(resActivities);
        }
        return respond("Activities not found.", true, 422);
      } else {
        throw new Error("Could not connect to the database.");
      }
    } catch (error) {
      console.log(error);
      return respond(error.message, true, 500);
    }
  }
  /**
   *
   * @param ownerId
   * @param contract
   * @param nftId
   * @returns
   */
  async insertFavourite(ownerId: string, collectionId: string, nftId: string) {
    const collTable = this.mongodb.collection(this.collectionTable);
    const nft = this.mongodb.collection(this.nftTable);
    const ownerTable = this.mongodb.collection(this.table);
    const collection = await collTable.findOne(this.findCollectionItem(collectionId));
    if (!collection) {
      return respond("collection not found", true, 501);
    }
    const queryNft = this.findNFTItem(collectionId, nftId);
    const nftResult = (await nft.findOne(queryNft)) as INFT;
    if (!nftResult) {
      return respond("Nft not found", true, 501);
    }
    const owner = (await ownerTable.findOne(this.findUserQuery(ownerId))) as IPerson;
    if (!owner) {
      return respond("to onwer not found.", true, 422);
    }
    // const index = owner.favourites.indexOf(nftResult,0);
    // const index = await owner.favourites.findIndex(o => o.index === nftResult.index);
    // if (index>=0){
    return respond("This NFT already favourite");
    // }else{
    //   owner.favourites.push(nftResult);
    //   ownerTable.replaceOne({wallet:owner.wallet},owner);
    //   await nft.updateOne({_id:nftResult._id},{$inc:{like:1}});
    //   return respond("Favourite updated");
    // }
  }
  /**
   *
   * @param ownerId
   * @param contract
   * @param nftId
   * @returns
   */
  async removeFavourite(ownerId: string, collectionId: string, nftId: string) {
    const collTable = this.mongodb.collection(this.collectionTable);
    const nft = this.mongodb.collection(this.nftTable);
    const ownerTable = this.mongodb.collection(this.table);
    const collection = await collTable.findOne(this.findCollectionItem(collectionId));
    if (!collection) {
      return respond("collection not found", true, 501);
    }
    const queryNft = this.findNFTItem(collectionId, nftId);
    const nftResult = (await nft.findOne(queryNft)) as INFT;
    if (!nftResult) {
      return respond("Nft not found", true, 501);
    }
    const owner = (await ownerTable.findOne(this.findUserQuery(ownerId))) as IPerson;
    if (!owner) {
      return respond("to onwer not found.", true, 422);
    }
    // const index = await owner.favourites.findIndex(o => o.index === nftResult.index);
    // if (index>=0){
    //   owner.favourites.splice(index,1);
    //   ownerTable.replaceOne({wallet:owner.wallet},owner);
    //   await nft.updateOne({_id:nftResult._id},{$inc:{like:-1}});
    return respond("Favourite removed");
    // }else{
    //   return respond("Nothing removed ");
    // }
  }


  private checkLimitRequest(limit:number){
    return limit<=1000?true:false;
  }

  private async countItemAndCollection(collection:string){
    const nftTable = this.mongodb.collection(this.nftTable);
    const items = await nftTable.find({ collection: `${collection}` },{projection:{_id:1}}).count();
    const owner =await nftTable.aggregate([
      {$match:{collection:`${collection}`}},    {"$group" : {_id:"$owner"}},{$count:"count"}
      ]).toArray();
      return {nfts:items,owner:owner.length>0?owner[0].count:0};
  }

  /**
   * Mounts a generic query to find an user by its ownerId.
   * @param ownerId =walletId
   * @returns
   */
  private findUserQuery(ownerId: String): Object {
    return { wallet: ownerId };
  }
  private findOwnerNtfs(ownerId: string): Object {
    // return {};
    // return { owner:'0xcF2370872F7628b3e41c3A6e30b5BA9cfE95CdF9' };
    return { owner: { $regex: new RegExp(ownerId, "igm") } };
  }
  private findOwnerHistory(ownerId: string): Object {
    return {
      $or: [{ from: { $regex: new RegExp(ownerId, "igm") }  }, { to: { $regex: new RegExp(ownerId, "igm") }  }],
    };
  }
  private findOwnerCollection(ownerId: string): Object {
    return  { creator: { $regex: new RegExp(ownerId, "igm") } };
  }
  /**
   * Mounts a generic query to find a collection by contract address.
   * @param collectionId
   * @returns
   */
  private findCollectionItem(collectionId: string): Object {
    return {
      _id: new ObjectId(collectionId),
    };
  }
  /**
   * Mounts a generic query to find an item by its collection contract and index.
   * @param collectionId
   * @returns
   */
  private findNFTItem(collectionId: string, nftId: string): Object {
    return {
      collection: collectionId,
      index: nftId,
    };
  }
}
