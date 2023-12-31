import { ConsoleLogger, Injectable } from "@nestjs/common";
import { FTMscanApiResponse, FTMscanResponse, TransactionDto, FTMscanTxListRequest } from "./ftmscan-api.dtos";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { catchError, firstValueFrom } from "rxjs";
import { AxiosError } from "axios";
import { Transaction } from "../../common/database/entities/transaction.entity";
import { Wallet } from "../../common/database/entities/wallet.entity";
import { Protocol } from "../../common/database/entities/protocol.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

@Injectable()
export class FTMscanApiService {
  baseUrl = this.configService.get<string>("FTMscanApi.url");
  apiKey = this.configService.get<string>("FTMscanApi.apiKey");

  constructor(
    private httpService: HttpService,
    private configService: ConfigService,
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(Protocol)
    private protocolRepository: Repository<Protocol>,
  ) {
    const check = async () => {
      // const isSynced = await this.syncTransactions("0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D");
      // console.log("isSynced", isSynced);
      // await this.deleteTables();
    };
    check();
  }

  async getIsInit(protocolAddress: string): Promise<boolean> {
    const lowerCasedProtocolAddress = protocolAddress.toLowerCase();
    let result = false;

    // protocol address
    const protocol = await this.protocolRepository.findOne({ where: { protocolAddress: lowerCasedProtocolAddress } });
    if (protocol !== null) {
      // tx 
      const txs = await this.transactionRepository.find({
        where: { protocolId: protocol.id },
      });
      if (txs !== null && txs.length > 0) {
        result = true;
      }
    }

    return result;
  }

  private async _createTransaction(transactionDto: TransactionDto): Promise<boolean> {
    const {
      from: walletAddress,
      to: protocolAddress,
      timeStamp,
      value,
      hash,
      blockNumber,
      functionName,
    } = transactionDto;
    try {
      let wallet = await this.walletRepository.findOne({ where: { walletAddress } });
      if (wallet == null) {
        wallet = await this.walletRepository.create({
          walletAddress,
          transactionNum: 0,
          transactions: [],
        });
      }
      wallet = await this.walletRepository.save(wallet);
      let protocol = await this.protocolRepository.findOne({ where: { protocolAddress } });

      if (protocol == null) {
        protocol = await this.protocolRepository.create({
          protocolAddress,
          protocolName: "",
          protocolType: "",
          transactions: [],
        });
      }

      protocol = await this.protocolRepository.save(protocol);

      const transaction = await this.transactionRepository.findOne({ where: { hash } });

      // functionName
      let eventName = functionName;
      const functionNameIndex = functionName.indexOf("(");
      if (functionNameIndex !== -1) eventName = functionName.substring(0, functionNameIndex);

      if (transaction == null) {
        await this.transactionRepository.save({
          wallet,
          protocol,
          timestamp: Number(timeStamp),
          hash,
          walletId: wallet.id,
          protocolId: protocol.id,
          eventName,
          totalValue: 0,
          coinValue: 0,
          tokenValue: 0,
          blockNumber: Number(blockNumber),
        });
      }

      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  private async _checkIsSyncedByBlockNumber(protocolAddress: string): Promise<boolean> {
    try {
      const protocol = await this.protocolRepository.findOne({ where: { protocolAddress } });

      if (protocol == null) {
        return false;
      }

      const transactions = await this.transactionRepository.find({
        where: { protocolId: protocol.id },
        order: { blockNumber: "DESC" },
      });
      if (transactions == null || transactions.length === 0) {
        return false;
      }

      const savedLastBlockNumber = transactions[0].blockNumber;
      const lastBlockNumber = await this._getLastBlockNumberFromFTMscan(
        protocolAddress,
        savedLastBlockNumber.toString(),
      );

      if (lastBlockNumber == 0) {
        return false;
      }

      if (lastBlockNumber != savedLastBlockNumber) {
        return false;
      }

      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  private async _getLastBlockNumberFromFTMscan(protocolAddress: string, savedBlockNumber: string): Promise<number> {
    const request: FTMscanTxListRequest = {
      address: protocolAddress,
      startblock: savedBlockNumber,
      endblock: "99999999",
      page: "1",
      offset: "1",
      sort: "desc",
      apikey: this.apiKey,
    };

    const url = `${this.baseUrl}&address=${request.address}&startblock=${request.startblock}&endblock=${request.endblock}&page=${request.page}&offset=${request.offset}&sort=${request.sort}&apikey=${request.apikey}`;

    const { data } = await firstValueFrom(this.httpService.get<FTMscanResponse>(url).pipe());

    if (data.status === "1") {
      return Number(data.result[0].blockNumber);
    }
    return 0;
  }

  async syncTransactions(protocolAddress: string): Promise<boolean> {
    try {
      const lowerCasedProtocolAddress = protocolAddress.toLowerCase();
      const isSynced = await this._checkIsSyncedByBlockNumber(lowerCasedProtocolAddress);
      if (isSynced) {
        return true;
      }

      // protocol

      while (true) {
        const protocol = await this.protocolRepository.findOne({
          where: { protocolAddress: lowerCasedProtocolAddress },
        });
        let savedLastBlockNumber: number;
        if (protocol !== null) {
          const protocolId = protocol.id;
          const transactions = await this.transactionRepository.find({
            where: { protocolId },
            order: { blockNumber: "DESC" },
          });
          savedLastBlockNumber = transactions[0].blockNumber;
        } else {
         
          savedLastBlockNumber = 0;
        }

        const request: FTMscanTxListRequest = {
          address: lowerCasedProtocolAddress,
          startblock: savedLastBlockNumber.toString(),
          endblock: "99999999",
          page: "1",
          offset: "1000",
          sort: "asc",
          apikey: this.apiKey,
        };

        const url = `${this.baseUrl}&address=${request.address}&startblock=${request.startblock}&endblock=${request.endblock}&page=${request.page}&offset=${request.offset}&sort=${request.sort}&apikey=${request.apikey}`;

        const { data } = await firstValueFrom(this.httpService.get<FTMscanResponse>(url).pipe());

        if (data.status === "1") {
          for (const tx of data.result) {
            await this._createTransaction(tx);
          }

          if (data.result.length < 1000) {
            break;
          }
        } else {
          throw Error(`FTMscan API Error: status code: ${data.status}`);
        }
      }
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async deleteTables() {
    try {
      await this.transactionRepository.delete({});
      await this.walletRepository.delete({});
      await this.protocolRepository.delete({});
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }
}
