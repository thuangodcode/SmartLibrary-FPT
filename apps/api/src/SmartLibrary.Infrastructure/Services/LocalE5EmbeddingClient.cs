using System.Security.Cryptography;
using Microsoft.Extensions.Configuration;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;
using Microsoft.ML.Tokenizers;
using SmartLibrary.Application.Features.Ai;

namespace SmartLibrary.Infrastructure.Services;

public sealed class LocalE5EmbeddingClient : ILocalEmbeddingClient, IDisposable
{
    public const string ModelId = AiRuntimeCredential.LocalEmbeddingModelId;
    public const int OutputDimensions = 768;
    private const int ModelDimensions = 384;
    private const int MaxSequenceLength = 128;
    private const long PaddingTokenId = 1;
    private const string Revision = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";
    private const string ModelFileName = "model_int8.onnx";
    private const string RemoteModelFileName = "onnx/model_int8.onnx";
    private const string TokenizerFileName = "sentencepiece.bpe.model";
    private const string ModelSha256 = "4d24e2bc01a447951524466ef533e52944bf48509e6552810bcee1a2711cb02c";
    private const string TokenizerSha256 = "cfc8146abe2a0488e9e2a0c56de7952f7c11ab059eca145a0a727afce0db2865";

    private readonly IHttpClientFactory _httpClientFactory;
    private readonly string _modelDirectory;
    private readonly SemaphoreSlim _initializationLock = new(1, 1);
    private readonly SemaphoreSlim _inferenceLock = new(1, 1);
    private InferenceSession? _session;
    private SentencePieceTokenizer? _tokenizer;

    public LocalE5EmbeddingClient(IHttpClientFactory httpClientFactory, IConfiguration configuration)
    {
        _httpClientFactory = httpClientFactory;
        _modelDirectory = configuration["Ai:LocalEmbeddingModelDirectory"]
                          ?? Path.Combine(Path.GetTempPath(), "smartlibrary-ai", ModelId);
    }

    public async Task<float[]> EmbedAsync(string text, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(text))
            throw new ArgumentException("Embedding text cannot be empty.", nameof(text));

        await _inferenceLock.WaitAsync(ct);
        try
        {
            await EnsureInitializedAsync(ct);
            return RunEmbedding(text);
        }
        finally
        {
            _inferenceLock.Release();
        }
    }

    private async Task EnsureInitializedAsync(CancellationToken ct)
    {
        if (_session is not null && _tokenizer is not null)
            return;

        await _initializationLock.WaitAsync(ct);
        try
        {
            if (_session is not null && _tokenizer is not null)
                return;

            Directory.CreateDirectory(_modelDirectory);
            var modelPath = Path.Combine(_modelDirectory, ModelFileName);
            var tokenizerPath = Path.Combine(_modelDirectory, TokenizerFileName);
            await EnsureModelFileAsync(modelPath, RemoteModelFileName, ModelSha256, ct);
            await EnsureModelFileAsync(tokenizerPath, TokenizerFileName, TokenizerSha256, ct);

            using var tokenizerStream = File.OpenRead(tokenizerPath);
            var tokenizer = SentencePieceTokenizer.Create(
                tokenizerStream,
                addBeginningOfSentence: true,
                addEndOfSentence: true);
            var options = new SessionOptions
            {
                GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_BASIC,
                ExecutionMode = ExecutionMode.ORT_SEQUENTIAL,
                IntraOpNumThreads = 1,
                InterOpNumThreads = 1,
                EnableCpuMemArena = false
            };
            var session = new InferenceSession(modelPath, options);

            _tokenizer = tokenizer;
            _session = session;
        }
        finally
        {
            _initializationLock.Release();
        }
    }

    private async Task EnsureModelFileAsync(string path, string remoteFileName, string sha256, CancellationToken ct)
    {
        if (File.Exists(path) && await HasExpectedHashAsync(path, sha256, ct))
            return;

        if (File.Exists(path))
            File.Delete(path);

        var temporaryPath = $"{path}.download";
        if (File.Exists(temporaryPath))
            File.Delete(temporaryPath);

        var url = $"https://huggingface.co/Xenova/multilingual-e5-small/resolve/{Revision}/{remoteFileName}";
        var client = _httpClientFactory.CreateClient("LocalAiModel");
        using var response = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
        response.EnsureSuccessStatusCode();

        await using (var source = await response.Content.ReadAsStreamAsync(ct))
        await using (var destination = new FileStream(
                         temporaryPath,
                         FileMode.CreateNew,
                         FileAccess.Write,
                         FileShare.None,
                         81920,
                         FileOptions.Asynchronous | FileOptions.SequentialScan))
        {
            await source.CopyToAsync(destination, ct);
        }

        if (!await HasExpectedHashAsync(temporaryPath, sha256, ct))
        {
            File.Delete(temporaryPath);
            throw new InvalidDataException($"Downloaded ONNX model file failed checksum validation: {remoteFileName}.");
        }

        File.Move(temporaryPath, path, overwrite: true);
    }

    private static async Task<bool> HasExpectedHashAsync(string path, string expected, CancellationToken ct)
    {
        await using var stream = File.OpenRead(path);
        var hash = await SHA256.HashDataAsync(stream, ct);
        return Convert.ToHexStringLower(hash) == expected;
    }

    private float[] RunEmbedding(string text)
    {
        var inputText = text.StartsWith("query: ", StringComparison.OrdinalIgnoreCase)
                        || text.StartsWith("passage: ", StringComparison.OrdinalIgnoreCase)
            ? text
            : $"passage: {text}";
        var ids = _tokenizer!.EncodeToIds(
            inputText,
            addBeginningOfSentence: true,
            addEndOfSentence: true,
            considerPreTokenization: true,
            considerNormalization: true);
        if (ids is null || ids.Count == 0)
            throw new InvalidOperationException("The local embedding tokenizer returned no tokens.");

        var tokenIds = ids.Take(MaxSequenceLength).Select(id => (long)id).ToArray();
        var sequenceLength = Math.Max(tokenIds.Length, 1);
        var inputIds = new long[sequenceLength];
        var attentionMask = new long[sequenceLength];
        var tokenTypeIds = new long[sequenceLength];
        Array.Fill(inputIds, PaddingTokenId);
        Array.Copy(tokenIds, inputIds, tokenIds.Length);
        Array.Fill(attentionMask, 1L, 0, tokenIds.Length);

        var inputs = new List<NamedOnnxValue>();
        foreach (var inputName in _session!.InputMetadata.Keys)
        {
            var tensor = inputName switch
            {
                "input_ids" => new DenseTensor<long>(inputIds, [1, sequenceLength]),
                "attention_mask" => new DenseTensor<long>(attentionMask, [1, sequenceLength]),
                "token_type_ids" => new DenseTensor<long>(tokenTypeIds, [1, sequenceLength]),
                _ => throw new InvalidOperationException($"Unsupported local ONNX model input: {inputName}.")
            };
            inputs.Add(NamedOnnxValue.CreateFromTensor(inputName, tensor));
        }

        using var outputs = _session.Run(inputs);
        var hiddenStates = outputs
            .Select(output => output.AsTensor<float>())
            .FirstOrDefault(tensor => tensor.Dimensions.Length == 3)
            ?? throw new InvalidOperationException("Local ONNX model did not return token hidden states.");

        if (hiddenStates.Dimensions[0] != 1
            || hiddenStates.Dimensions[1] < tokenIds.Length
            || hiddenStates.Dimensions[2] != ModelDimensions)
        {
            throw new InvalidOperationException("Local ONNX model returned an unexpected embedding shape.");
        }

        var pooled = new float[ModelDimensions];
        for (var tokenIndex = 0; tokenIndex < tokenIds.Length; tokenIndex++)
        {
            for (var dimension = 0; dimension < ModelDimensions; dimension++)
                pooled[dimension] += hiddenStates[0, tokenIndex, dimension];
        }

        var normSquared = 0f;
        for (var dimension = 0; dimension < ModelDimensions; dimension++)
        {
            pooled[dimension] /= tokenIds.Length;
            normSquared += pooled[dimension] * pooled[dimension];
        }

        var norm = MathF.Sqrt(normSquared);
        if (norm <= 0 || !float.IsFinite(norm))
            throw new InvalidOperationException("Local ONNX model returned an invalid embedding.");

        var result = new float[OutputDimensions];
        for (var dimension = 0; dimension < ModelDimensions; dimension++)
            result[dimension] = pooled[dimension] / norm;
        return result;
    }

    public void Dispose()
    {
        _session?.Dispose();
        _initializationLock.Dispose();
        _inferenceLock.Dispose();
    }
}
