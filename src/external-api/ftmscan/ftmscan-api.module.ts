import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { FTMscanApiService } from "./ftmscan-api.service";

import { HttpModule } from "@nestjs/axios";
import { FTMscanApiConfig } from "../../common/config/ftmscan.api.config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Transaction } from "../../common/database/entities/transaction.entity";
import { Wallet } from "../../common/database/entities/wallet.entity";
import { Protocol } from "../../common/database/entities/protocol.entity";

@Module({
  imports: [ 
    HttpModule.registerAsync({
      useFactory: async (c: ConfigService) => ({
        baseURL: `${c.get<FTMscanApiConfig>("FTMscanApi").url}`,
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forFeature([Transaction, Wallet, Protocol]),
  ],
  providers: [FTMscanApiService],
  exports: [FTMscanApiService],
})
export class FTMscanApiModule {
  constructor(private FTMscanApiService: FTMscanApiService) {
    // this.FTMscanApiService.getTxList();
  }
}
