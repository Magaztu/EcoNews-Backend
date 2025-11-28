import { Test, TestingModule } from '@nestjs/testing';
import { WahaController } from './waha.controller';

describe('WahaController', () => {
  let controller: WahaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WahaController],
    }).compile();

    controller = module.get<WahaController>(WahaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
