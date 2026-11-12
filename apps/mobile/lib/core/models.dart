class User {
  const User({required this.id, required this.name, required this.email, required this.role});
  final String id;
  final String name;
  final String email;

  /// admin | hub | courier | merchant
  final String role;

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: j['userId'] as String,
        name: j['name'] as String,
        email: j['email'] as String,
        role: j['role'] as String,
      );
}

class ParcelEvent {
  const ParcelEvent({required this.status, required this.at, this.hub, this.note = ''});
  final String status;
  final DateTime at;
  final String? hub;
  final String note;

  factory ParcelEvent.fromJson(Map<String, dynamic> j) => ParcelEvent(
        status: j['status'] as String,
        at: DateTime.parse((j['createdAt'] ?? j['at']) as String).toLocal(),
        hub: j['hub'] as String?,
        note: (j['note'] as String?) ?? '',
      );
}

class Parcel {
  const Parcel({
    required this.id,
    required this.tracking,
    required this.status,
    required this.recipientName,
    required this.recipientPhone,
    required this.wilaya,
    required this.commune,
    required this.address,
    required this.codAmount,
    required this.deliveryFee,
    required this.merchantName,
    required this.updatedAt,
    this.events = const [],
  });

  final String id;
  final String tracking;
  final String status;
  final String recipientName;
  final String recipientPhone;
  final String wilaya;
  final String commune;
  final String address;
  final int codAmount;
  final int deliveryFee;
  final String merchantName;
  final DateTime updatedAt;
  final List<ParcelEvent> events;

  factory Parcel.fromJson(Map<String, dynamic> j) => Parcel(
        id: j['id'] as String,
        tracking: j['tracking'] as String,
        status: j['status'] as String,
        recipientName: j['recipientName'] as String,
        recipientPhone: j['recipientPhone'] as String,
        wilaya: (j['destWilaya'] as String?) ?? '',
        commune: j['commune'] as String,
        address: j['address'] as String,
        codAmount: (j['codAmount'] as num).toInt(),
        deliveryFee: (j['deliveryFee'] as num).toInt(),
        merchantName: (j['merchantName'] as String?) ?? '',
        updatedAt: DateTime.parse(j['updatedAt'] as String).toLocal(),
        events: ((j['events'] as List?) ?? const [])
            .map((e) => ParcelEvent.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class Wilaya {
  const Wilaya({required this.id, required this.name});
  final int id;
  final String name;

  factory Wilaya.fromJson(Map<String, dynamic> j) => Wilaya(id: j['id'] as int, name: j['name'] as String);
}

class WalletEntry {
  const WalletEntry({required this.kind, required this.memo, required this.at, required this.amount});
  final String kind;
  final String memo;
  final DateTime at;

  /// Positive is money in the merchant's favour.
  final int amount;

  factory WalletEntry.fromJson(Map<String, dynamic> j) => WalletEntry(
        kind: j['kind'] as String,
        memo: (j['memo'] as String?) ?? '',
        at: DateTime.parse(j['at'] as String).toLocal(),
        amount: (j['amount'] as num).toInt(),
      );
}

const statusLabels = <String, String>{
  'created': 'Created',
  'pickup_assigned': 'Pickup assigned',
  'picked_up': 'Picked up',
  'at_origin_hub': 'At origin hub',
  'in_transit': 'In transit',
  'at_destination_hub': 'At destination hub',
  'out_for_delivery': 'Out for delivery',
  'delivered': 'Delivered',
  'attempt_failed': 'Attempt failed',
  'return_initiated': 'Return initiated',
  'returned': 'Returned to merchant',
  'cancelled': 'Cancelled',
  'lost': 'Lost',
};
