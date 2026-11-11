namespace SmartLibrary.Domain.Enums;

public enum BookCondition
{
    New = 0,
    Good = 1,
    Fair = 2,
    Damaged = 3,
    Lost = 4,
    // Verified cosmetic damage: still fit for circulation, with incident history retained.
    LightDamaged = 5
}
