namespace SmartLibrary.Application.Interfaces;

public interface ISecretProtector
{
    string Protect(string plaintext);
    string Unprotect(string protectedValue);
}
