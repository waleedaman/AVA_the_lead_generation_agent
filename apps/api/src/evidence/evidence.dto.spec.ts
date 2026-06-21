import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateEvidenceDto } from './dto/create-evidence.dto';

describe('CreateEvidenceDto', () => {
  const basePayload = {
    campaignId: '64f0f0f0f0f0f0f0f0f0f0f0',
    companyId: '64f0f0f0f0f0f0f0f0f0f0f1',
    sourceType: 'website_product',
    url: 'https://example.com/product',
  };

  it('accepts provider metadata and a valid retrieval status', async () => {
    const dto = plainToInstance(CreateEvidenceDto, {
      ...basePayload,
      retrievalStatus: 'metadata_only',
      providerStatus: {
        provider: 'linkedin_official_provider',
        status: 'metadata_only',
        evidenceCount: 1,
      },
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects unsupported retrieval statuses', async () => {
    const dto = plainToInstance(CreateEvidenceDto, {
      ...basePayload,
      retrievalStatus: 'mystery',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'retrievalStatus')).toBe(true);
  });
});
