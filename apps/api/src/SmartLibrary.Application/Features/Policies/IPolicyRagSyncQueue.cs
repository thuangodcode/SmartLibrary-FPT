namespace SmartLibrary.Application.Features.Policies;

public interface IPolicyRagSyncQueue
{
    void Enqueue(Guid policyId, bool shouldIndex);
}
