import 'i18n.dart';

DateTime _date(Object? v) => DateTime.parse(v as String).toLocal();
DateTime? _dateOrNull(Object? v) => v == null ? null : _date(v);
int _int(Object? v) => (v as num?)?.toInt() ?? 0;
double? _dbl(Object? v) => (v as num?)?.toDouble();
String _str(Object? v) => (v as String?) ?? '';

class User {
  const User({required this.id, required this.name, required this.email, required this.role, this.hubId, this.merchantId, this.phone = ''});
  final String id;
  final String name;
  final String email;

  /// admin | hub | courier | merchant
  final String role;
  final String? hubId;
  final String? merchantId;
  final String phone;

  String get firstName => name.split(' ').first;

  factory User.fromJson(Map<String, dynamic> j) => User(
        id: j['userId'] as String,
        name: j['name'] as String,
        email: j['email'] as String,
        role: j['role'] as String,
        hubId: j['hubId'] as String?,
        merchantId: j['merchantId'] as String?,
        phone: _str(j['phone']),
      );
}

class ParcelEvent {
  const ParcelEvent({required this.status, required this.at, this.hub, this.note = '', this.actor});
  final String status;
  final DateTime at;
  final String? hub;
  final String note;
  final String? actor;

  factory ParcelEvent.fromJson(Map<String, dynamic> j) => ParcelEvent(
        status: j['status'] as String,
        at: _date(j['createdAt'] ?? j['at']),
        hub: j['hub'] as String?,
        note: _str(j['note']),
        actor: j['actor'] as String?,
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
    required this.wilayaAr,
    required this.commune,
    required this.communeAr,
    required this.address,
    required this.codAmount,
    required this.deliveryFee,
    required this.returnFee,
    required this.merchantName,
    required this.updatedAt,
    required this.createdAt,
    this.description = '',
    this.weightKg = 1,
    this.attempts = 0,
    this.routeSeq,
    this.lat,
    this.lng,
    this.instructions = '',
    this.preferredDate,
    this.failReason,
    this.courierName,
    this.destHub,
    this.currentHub,
    this.rating,
    this.events = const [],
  });

  final String id;
  final String tracking;
  final String status;
  final String recipientName;
  final String recipientPhone;
  final String wilaya;
  final String wilayaAr;
  final String commune;
  final String communeAr;
  final String address;
  final int codAmount;
  final int deliveryFee;
  final int returnFee;
  final String merchantName;
  final DateTime updatedAt;
  final DateTime createdAt;
  final String description;
  final int weightKg;
  final int attempts;
  final int? routeSeq;
  final double? lat;
  final double? lng;
  final String instructions;
  final String? preferredDate;
  final String? failReason;
  final String? courierName;
  final String? destHub;
  final String? currentHub;
  final int? rating;
  final List<ParcelEvent> events;

  /// Names in the app's language: Arabic names for Arabic, the Latin spelling otherwise.
  String get place => I18n.lang == 'ar'
      ? '${communeAr.isNotEmpty ? communeAr : commune}، ${wilayaAr.isNotEmpty ? wilayaAr : wilaya}'
      : '$commune, $wilaya';

  int get merchantNet => codAmount - deliveryFee;
  bool get hasMapPoint => lat != null && lng != null;

  factory Parcel.fromJson(Map<String, dynamic> j) => Parcel(
        id: j['id'] as String,
        tracking: j['tracking'] as String,
        status: j['status'] as String,
        recipientName: _str(j['recipientName']),
        recipientPhone: _str(j['recipientPhone']),
        wilaya: _str(j['destWilaya']),
        wilayaAr: _str(j['destWilayaAr']),
        commune: _str(j['commune']),
        communeAr: _str(j['communeAr']),
        address: _str(j['address']),
        codAmount: _int(j['codAmount']),
        deliveryFee: _int(j['deliveryFee']),
        returnFee: _int(j['returnFee']),
        merchantName: _str(j['merchantName']),
        updatedAt: _date(j['updatedAt']),
        createdAt: _date(j['createdAt'] ?? j['updatedAt']),
        description: _str(j['description']),
        weightKg: _int(j['weightKg']),
        attempts: _int(j['attempts']),
        routeSeq: (j['routeSeq'] as num?)?.toInt(),
        lat: _dbl(j['lat']),
        lng: _dbl(j['lng']),
        instructions: _str(j['instructions']),
        preferredDate: j['preferredDate'] as String?,
        failReason: j['failReason'] as String?,
        courierName: j['courierName'] as String?,
        destHub: j['destHub'] as String?,
        currentHub: j['currentHub'] as String?,
        rating: (j['rating'] as num?)?.toInt(),
        events: ((j['events'] as List?) ?? const []).map((e) => ParcelEvent.fromJson(e as Map<String, dynamic>)).toList(),
      );
}

class Proof {
  const Proof({required this.id, required this.kind, required this.receivedBy, required this.at});
  final String id;

  /// code | photo | signature
  final String kind;
  final String receivedBy;
  final DateTime at;

  factory Proof.fromJson(Map<String, dynamic> j) =>
      Proof(id: j['id'] as String, kind: j['kind'] as String, receivedBy: _str(j['receivedBy']), at: _date(j['createdAt']));
}

class Claim {
  const Claim({
    required this.id,
    required this.code,
    required this.kind,
    required this.status,
    required this.amountRequested,
    required this.tracking,
    required this.parcelId,
    required this.createdAt,
    this.amountApproved,
    this.description = '',
    this.decisionNote = '',
    this.photoIds = const [],
    this.cap,
  });
  final String id;
  final String code;
  final String kind;

  /// open | approved | rejected
  final String status;
  final int amountRequested;
  final int? amountApproved;
  final String tracking;
  final String parcelId;
  final DateTime createdAt;
  final String description;
  final String decisionNote;
  final List<String> photoIds;
  final int? cap;

  factory Claim.fromJson(Map<String, dynamic> j) => Claim(
        id: j['id'] as String,
        code: j['code'] as String,
        kind: j['kind'] as String,
        status: j['status'] as String,
        amountRequested: _int(j['amountRequested']),
        amountApproved: (j['amountApproved'] as num?)?.toInt(),
        tracking: _str(j['tracking']),
        parcelId: _str(j['parcelId']),
        createdAt: _date(j['createdAt']),
        description: _str(j['description']),
        decisionNote: _str(j['decisionNote']),
        photoIds: ((j['photoIds'] as List?) ?? const []).cast<String>(),
        cap: (j['cap'] as num?)?.toInt(),
      );
}

class Wilaya {
  const Wilaya({required this.id, required this.name, required this.nameAr, required this.hubId, required this.hub});
  final int id;
  final String name;
  final String nameAr;
  final String hubId;
  final String hub;

  String get label => '${_two(id)} ${I18n.lang == 'ar' ? nameAr : name}';

  factory Wilaya.fromJson(Map<String, dynamic> j) =>
      Wilaya(id: _int(j['id']), name: _str(j['name']), nameAr: _str(j['nameAr']), hubId: _str(j['hubId']), hub: _str(j['hub']));
}

String _two(int n) => n.toString().padLeft(2, '0');

class Commune {
  const Commune({required this.id, required this.name, required this.nameAr});
  final int id;
  final String name;
  final String nameAr;
  String get label => I18n.lang == 'ar' ? nameAr : name;
  factory Commune.fromJson(Map<String, dynamic> j) => Commune(id: _int(j['id']), name: _str(j['name']), nameAr: _str(j['nameAr']));
}

class Hub {
  const Hub({required this.id, required this.code, required this.name});
  final String id;
  final String code;
  final String name;
  factory Hub.fromJson(Map<String, dynamic> j) => Hub(id: j['id'] as String, code: _str(j['code']), name: _str(j['name']));
}

class WalletEntry {
  const WalletEntry({required this.kind, required this.memo, required this.at, required this.amount});
  final String kind;
  final String memo;
  final DateTime at;

  /// Positive is money in the merchant's favour.
  final int amount;

  factory WalletEntry.fromJson(Map<String, dynamic> j) =>
      WalletEntry(kind: j['kind'] as String, memo: _str(j['memo']), at: _date(j['at']), amount: _int(j['amount']));
}

class Bag {
  const Bag({
    required this.id,
    required this.code,
    required this.status,
    required this.originHubId,
    required this.destHubId,
    required this.origin,
    required this.dest,
    required this.parcels,
    required this.cod,
    this.manifestId,
    this.manifestCode,
  });
  final String id;
  final String code;

  /// open | sealed | in_transit | received
  final String status;
  final String originHubId;
  final String destHubId;
  final String origin;
  final String dest;
  final int parcels;
  final int cod;
  final String? manifestId;
  final String? manifestCode;

  factory Bag.fromJson(Map<String, dynamic> j) => Bag(
        id: j['id'] as String,
        code: j['code'] as String,
        status: j['status'] as String,
        originHubId: _str(j['originHubId']),
        destHubId: _str(j['destHubId']),
        origin: _str(j['origin']),
        dest: _str(j['dest']),
        parcels: _int(j['parcels']),
        cod: _int(j['cod']),
        manifestId: j['manifestId'] as String?,
        manifestCode: j['manifestCode'] as String?,
      );
}

class Manifest {
  const Manifest({
    required this.id,
    required this.code,
    required this.status,
    required this.originHubId,
    required this.destHubId,
    required this.origin,
    required this.dest,
    required this.bags,
    required this.parcels,
    this.vehicle = '',
    this.driver = '',
    this.departedAt,
  });
  final String id;
  final String code;

  /// open | departed | arrived
  final String status;
  final String originHubId;
  final String destHubId;
  final String origin;
  final String dest;
  final int bags;
  final int parcels;
  final String vehicle;
  final String driver;
  final DateTime? departedAt;

  factory Manifest.fromJson(Map<String, dynamic> j) => Manifest(
        id: j['id'] as String,
        code: j['code'] as String,
        status: j['status'] as String,
        originHubId: _str(j['originHubId']),
        destHubId: _str(j['destHubId']),
        origin: _str(j['origin']),
        dest: _str(j['dest']),
        bags: _int(j['bags']),
        parcels: _int(j['parcels']),
        vehicle: _str(j['vehicle']),
        driver: _str(j['driver']),
        departedAt: _dateOrNull(j['departedAt']),
      );
}

class AppNotification {
  const AppNotification({required this.id, required this.kind, required this.title, required this.body, required this.data, required this.at, required this.read});
  final String id;
  final String kind;
  final String title;
  final String body;
  final Map<String, dynamic> data;
  final DateTime at;
  final bool read;

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: j['id'] as String,
        kind: _str(j['kind']),
        title: _str(j['title']),
        body: _str(j['body']),
        data: (j['data'] as Map?)?.cast<String, dynamic>() ?? const {},
        at: _date(j['createdAt']),
        read: j['readAt'] != null,
      );
}

/// Status names, translated with [tr] where shown.
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

/// Why a delivery failed. Same keys as the server.
const failReasons = <String, String>{
  'no_answer': 'Recipient not answering',
  'absent': 'Recipient absent',
  'refused': 'Refused the parcel',
  'wrong_address': 'Wrong address',
  'reschedule': 'Asked to come another day',
  'unreachable': 'Phone unreachable',
  'other': 'Other reason',
};

const claimKinds = <String, String>{'damaged': 'Damaged', 'missing_items': 'Items missing', 'lost': 'Lost'};
const claimStatus = <String, String>{'open': 'Under review', 'approved': 'Approved', 'rejected': 'Declined'};
const bagStatus = <String, String>{'open': 'Open', 'sealed': 'Sealed', 'in_transit': 'On a truck', 'received': 'Received'};
const manifestStatus = <String, String>{'open': 'Loading', 'departed': 'On the road', 'arrived': 'Arrived'};
