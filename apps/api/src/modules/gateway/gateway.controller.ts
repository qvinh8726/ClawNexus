/**
 * ClawAI Gateway - Gateway Controller
 * OpenAI-compatible API endpoints
 */

import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { Response } from 'express';
import {
  IsString,
  IsArray,
  IsOptional,
  IsNumber,
  IsBoolean,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import { GatewayService } from './gateway.service';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

class ChatMessageDto {
  @IsString()
  role!: 'system' | 'user' | 'assistant';

  @IsString()
  content!: string;

  @IsString()
  @IsOptional()
  name?: string;
}

class ChatCompletionRequestDto {
  @IsString()
  model!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  messages!: ChatMessageDto[];

  @IsNumber()
  @IsOptional()
  temperature?: number;

  @IsNumber()
  @IsOptional()
  top_p?: number;

  @IsNumber()
  @IsOptional()
  n?: number;

  @IsBoolean()
  @IsOptional()
  stream?: boolean;

  @IsOptional()
  stop?: string | string[];

  @IsNumber()
  @IsOptional()
  max_tokens?: number;

  @IsNumber()
  @IsOptional()
  presence_penalty?: number;

  @IsNumber()
  @IsOptional()
  frequency_penalty?: number;

  @IsString()
  @IsOptional()
  user?: string;
}

@ApiTags('OpenAI Compatible')
@Controller('v1')
export class GatewayController {
  private readonly logger = new Logger(GatewayController.name);

  constructor(private gatewayService: GatewayService) {}

  @Post('chat/completions')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'Create chat completion (OpenAI compatible)' })
  async createChatCompletion(
    @Body() dto: ChatCompletionRequestDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const userId = req.user.userId;

    const request = {
      userId,
      model: dto.model,
      messages: dto.messages.map((m) => ({
        role: m.role as any,
        content: m.content,
        name: m.name,
      })),
      temperature: dto.temperature,
      topP: dto.top_p,
      n: dto.n,
      stream: dto.stream,
      stop: dto.stop,
      maxTokens: dto.max_tokens,
      presencePenalty: dto.presence_penalty,
      frequencyPenalty: dto.frequency_penalty,
      user: dto.user,
    };

    this.logger.debug(`Processing request for model: ${dto.model}`);

    try {
      const result = await this.gatewayService.processRequest(request);

      if (result.stream) {
        // Handle streaming response
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        try {
          for await (const chunk of result.stream) {
            const data = JSON.stringify({
              id: chunk.id,
              object: chunk.object,
              created: chunk.created,
              model: chunk.model,
              choices: chunk.choices.map((c) => ({
                index: c.index,
                delta: {
                  role: c.delta.role,
                  content: c.delta.content,
                },
                finish_reason: c.finishReason,
              })),
            });

            res.write(`data: ${data}\n\n`);
          }

          res.write('data: [DONE]\n\n');
          res.end();
        } catch (streamError) {
          this.logger.error('Stream error:', streamError);
          res.end();
        }
      } else {
        // Handle non-streaming response
        const response = result.response!;

        res.json({
          id: response.id,
          object: response.object,
          created: response.created,
          model: response.model,
          choices: response.choices.map((c) => ({
            index: c.index,
            message: {
              role: c.message.role,
              content: c.message.content,
            },
            finish_reason: c.finishReason,
          })),
          usage: {
            prompt_tokens: response.usage.promptTokens,
            completion_tokens: response.usage.completionTokens,
            total_tokens: response.usage.totalTokens,
          },
        });
      }
    } catch (error) {
      this.logger.error('Request failed:', error);

      const message = error instanceof Error ? error.message : 'Internal error';

      res.status(500).json({
        error: {
          message,
          type: 'api_error',
          code: 'internal_error',
        },
      });
    }
  }

  @Get('models')
  @UseGuards(ApiKeyGuard)
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'List available models' })
  async listModels(@Request() req: any) {
    const userId = req.user.userId;
    const models = await this.gatewayService.getAvailableModels(userId);

    return {
      object: 'list',
      data: models,
    };
  }
}
